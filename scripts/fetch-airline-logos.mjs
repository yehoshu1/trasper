/**
 * Fetch airline logos from Wikimedia Commons and store them locally so
 * documents render the carrier's own mark (upload and replace
 * logos — this seeds the first copy; staff can replace any of them in
 * Settings → Airlines).
 *
 * For each airline without a logo it searches Commons for "<name> logo",
 * downloads a 400px PNG rendering (SVG is rasterised by Wikimedia), writes
 * uploads/airlines/<iata>.png and sets Airline.logoPath.
 *
 *   node scripts/fetch-airline-logos.mjs          # missing logos only
 *   node scripts/fetch-airline-logos.mjs --force  # re-download all
 *
 * Network access to wikimedia.org is required; failures are reported and
 * skipped so the script is safe to re-run. Images remain subject to their
 * own licences on Commons; they are stored here for internal document use.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

process.umask(0o077);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rawUrl = process.env.DATABASE_URL ?? "file:./data/app.db";
const file = path.resolve(root, rawUrl.replace(/^file:/, ""));
const db = new DatabaseSync(file);

const uploadDir = path.resolve(root, process.env.UPLOAD_DIR ?? "./uploads", "airlines");
mkdirSync(uploadDir, { recursive: true });

const force = process.argv.includes("--force");
const UA = "trasper/1.0 (logo seeding)";

/** Run a request, backing off politely when Wikimedia returns 429. */
async function withBackoff(task, attempts = 5) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      if (!/throttled|HTTP 429|api error/.test(String(error?.message))) throw error;
      if (attempt >= attempts) throw error;
      const waitMs = error.retryAfter ?? 15_000 * attempt;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}

/** Search Commons files for the airline's logo and return the best candidate. */
async function findLogo(name) {
  // The full name can push the logo out of the result window ("Thai Airways
  // International" ranks terminals above "Thai Airways logo.svg"), so try the
  // full name first and fall back to the leading words.
  const firstWords = name.split(/\s+/).slice(0, 2).join(" ");
  const attempts = [name, firstWords].filter((value, index, all) => all.indexOf(value) === index);

  for (const query of attempts) {
    const candidate = await searchLogo(query, name);
    if (candidate) return candidate;
  }
  return null;
}

async function searchLogo(query, fullName) {
  // Commons first; many airline logos are non-free and live only in English
  // Wikipedia's File namespace, so fall back to that search too.
  for (const host of ["commons.wikimedia.org", "en.wikipedia.org"]) {
    const candidate = await searchLogoOn(host, query, fullName);
    if (candidate) return candidate;
  }
  return null;
}

async function searchLogoOn(host, query, fullName) {
  const url = new URL(`https://${host}/w/api.php`);
  for (const [key, value] of Object.entries({
    action: "query",
    generator: "search",
    gsrsearch: `${query} logo`,
    gsrnamespace: "6",
    gsrlimit: "10",
    prop: "imageinfo",
    iiprop: "url|mime|size",
    iiurlwidth: "400",
    format: "json",
  })) {
    url.searchParams.set(key, value);
  }
  const search = await withBackoff(() =>
    fetch(url, { headers: { "User-Agent": UA } }).then(async (response) => {
      if (response.status === 429) {
        throw Object.assign(new Error("throttled"), {
          retryAfter: Number(response.headers.get("retry-after")) * 1000 || 15_000,
        });
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json();
      if (body?.error) {
        throw Object.assign(new Error(`api error ${body.error.code}`), {
          retryAfter: body.error.code === "maxlag" ? 20_000 : 5_000,
        });
      }
      return body;
    }),
  );
  const pages = Object.values(search?.query?.pages ?? {});
  // Prefer a file whose title contains "logo" and the airline's first word,
  // is an SVG/PNG, and is not a tiny icon or a photo of an aircraft.
  const scored = pages
    .filter((page) => page.imageinfo?.[0]?.thumburl)
    .map((page) => {
      const info = page.imageinfo[0];
      const title = String(page.title).toLowerCase();
      const firstWord = fullName.split(/\s+/)[0].toLowerCase();
      let score = 0;
      if (title.includes("logo")) score += 4;
      if (title.includes(firstWord)) score += 3;
      if (info.mime === "image/svg+xml" || title.endsWith(".svg")) score += 2;
      if (info.mime === "image/png") score += 1;
      if (title.includes("map") || title.includes("photo")) score -= 6;
      if (title.includes("tail") || title.includes("aircraft")) score -= 4;
      return { page, info, score };
    })
    .sort((a, b) => b.score - a.score);
  return scored[0] && scored[0].score >= 4 ? scored[0] : null;
}

const airlines = db
  .prepare("SELECT iata, name, logoPath FROM Airline ORDER BY iata")
  .all();

let fetched = 0;
let skipped = 0;
const failed = [];

for (const airline of airlines) {
  if (!force && airline.logoPath) {
    skipped += 1;
    continue;
  }
  try {
    const candidate = await withBackoff(() => findLogo(airline.name));
    if (!candidate) {
      failed.push(`${airline.iata} ${airline.name} (no logo file found)`);
      continue;
    }
    const bytes = await withBackoff(async () => {
      const response = await fetch(candidate.info.thumburl, {
        headers: { "User-Agent": UA },
      });
      if (response.status === 429) {
        throw Object.assign(new Error("throttled"), {
          retryAfter: Number(response.headers.get("retry-after")) * 1000 || 15_000,
        });
      }
      if (!response.ok) throw new Error(`download HTTP ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length < 200) throw new Error("download too small");
      if (buffer.length > 5 * 1024 * 1024) throw new Error("download too large");
      // Only store a real PNG: the file is served inline as image/png.
      const png =
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47 &&
        buffer[4] === 0x0d &&
        buffer[5] === 0x0a &&
        buffer[6] === 0x1a &&
        buffer[7] === 0x0a;
      if (!png) throw new Error("download is not a PNG");
      return buffer;
    });
    const fileName = `${airline.iata.toLowerCase()}.png`;
    writeFileSync(path.join(uploadDir, fileName), bytes, { mode: 0o600 });
    db.prepare("UPDATE Airline SET logoPath = ? WHERE iata = ?").run(
      `/uploads/airlines/${fileName}`,
      airline.iata,
    );
    fetched += 1;
    process.stdout.write(`ok   ${airline.iata} ${airline.name}\n`);
  } catch (error) {
    failed.push(`${airline.iata} ${airline.name} (${error.message})`);
  }
  // Be polite to the API: one airline's four requests, then a longer pause.
  await new Promise((resolve) => setTimeout(resolve, 1200));
}

console.log(`\n${fetched} logos stored, ${skipped} already had one, ${failed.length} failed.`);
if (failed.length > 0) {
  console.log("Upload these manually in Settings → Airlines:");
  for (const entry of failed) console.log("  " + entry);
}
db.close();
