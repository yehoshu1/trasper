import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateAiBaseUrl } from "../src/lib/ai-url";
import { safeAvatarUrl } from "../src/lib/avatar";
import { csvCell, escapeCsvFormula, MAX_CSV_ROWS, parseContactCsv } from "../src/lib/csv";
import { contentDisposition, safeDownloadFilename } from "../src/lib/download";
import { isSameOriginRequest } from "../src/lib/http";
import { detectImageMime, imageMatchesDeclaredType } from "../src/lib/image-signature";
import { parseMoneyToMinor, parsePercentToBps, parseRateToMicro } from "../src/lib/money";
import { aiSettingsSchema } from "../src/lib/schemas";
import { renderNumber } from "../src/lib/numbering";
import { FixedWindowRateLimiter } from "../src/lib/rate-limit";
import {
  DEVELOPMENT_AUTH_SECRET,
  isWeakSecret,
  resolveAppUrl,
  resolveAuthSecret,
} from "../src/lib/security-env";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const webp = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);
const html = new TextEncoder().encode("<!doctype html><script>alert(1)</script>");

describe("spreadsheet formula injection", () => {
  it("neutralises formula prefixes but keeps numbers numeric", () => {
    assert.equal(escapeCsvFormula('=HYPERLINK("https://evil","click")'), `'=HYPERLINK("https://evil","click")`);
    assert.equal(escapeCsvFormula("+1+1"), "'+1+1");
    assert.equal(escapeCsvFormula("@SUM(A1)"), "'@SUM(A1)");
    assert.equal(escapeCsvFormula("\tcmd"), "'\tcmd");
    assert.equal(escapeCsvFormula("-123.45"), "-123.45");
    assert.equal(escapeCsvFormula("-1+1"), "'-1+1");
    assert.equal(escapeCsvFormula("Chirwa Holdings"), "Chirwa Holdings");
  });

  it("quotes cells and applies the formula guard", () => {
    assert.equal(csvCell("ACME, Ltd"), '"ACME, Ltd"');
    assert.equal(csvCell('He said "hi"'), '"He said ""hi"""');
    assert.equal(csvCell("=1+1"), "'=1+1");
    assert.equal(csvCell(-500n), "-500");
  });
});

describe("CSV import limits", () => {
  it("truncates files over the row cap instead of looping without bound", () => {
    const rows = ["name"];
    for (let i = 0; i < MAX_CSV_ROWS + 5; i += 1) rows.push(`Customer ${i}`);
    const parsed = parseContactCsv(rows.join("\n"));
    assert.equal(parsed.truncated, true);
    assert.equal(parsed.rows.length, MAX_CSV_ROWS);
  });

  it("rejects an oversized file", () => {
    assert.throws(() => parseContactCsv("x".repeat(5 * 1024 * 1024 + 1)));
  });
});

describe("download headers", () => {
  it("removes CR/LF and quotes from document numbers", () => {
    assert.equal(safeDownloadFilename('QT-01\r\nX-Evil: 1".pdf'), "QT-01-X-Evil- 1-.pdf");
    assert.equal(safeDownloadFilename("../../etc/passwd"), "passwd");
  });

  it("emits an ASCII fallback plus RFC 5987 UTF-8 name", () => {
    const header = contentDisposition("quotation QT-01.pdf");
    assert.match(header, /^attachment; filename="quotation QT-01\.pdf"; filename\*=UTF-8''quotation%20QT-01\.pdf$/);
    const unicode = contentDisposition("Qüotation.pdf");
    assert.ok(unicode.includes("filename*=UTF-8''Q%C3%BCotation.pdf"));
    assert.ok(!unicode.includes("\r"));
    assert.ok(!unicode.includes("\n"));
  });
});

describe("avatar URL redaction", () => {
  it("only renders avatars written by the upload route", () => {
    assert.equal(safeAvatarUrl("/uploads/avatars/user-123.png"), "/uploads/avatars/user-123.png");
    assert.equal(safeAvatarUrl("https://evil.example/pixel.png"), null);
    assert.equal(safeAvatarUrl("data:image/svg+xml,<svg onload=alert(1)>"), null);
    assert.equal(safeAvatarUrl("/uploads/avatars/../secret.png"), null);
    assert.equal(safeAvatarUrl(null), null);
  });
});

describe("uploaded image signatures", () => {
  it("recognises the allowed formats from magic bytes", () => {
    assert.equal(detectImageMime(png), "image/png");
    assert.equal(detectImageMime(jpeg), "image/jpeg");
    assert.equal(detectImageMime(webp), "image/webp");
  });

  it("rejects HTML disguised as an image", () => {
    assert.equal(detectImageMime(html), null);
    assert.equal(imageMatchesDeclaredType(html, "image/png"), false);
    assert.equal(imageMatchesDeclaredType(png, "image/png"), true);
    assert.equal(imageMatchesDeclaredType(png, "image/jpeg"), false);
  });
});

describe("fixed-window rate limiter", () => {
  it("allows up to the limit, blocks, and recovers after the window", () => {
    let now = 1_000;
    const limiter = new FixedWindowRateLimiter(() => now);
    const rule = { limit: 3, windowMs: 60_000 };
    assert.equal(limiter.consume("k", rule).allowed, true);
    assert.equal(limiter.consume("k", rule).allowed, true);
    assert.equal(limiter.consume("k", rule).allowed, true);
    const blocked = limiter.consume("k", rule);
    assert.equal(blocked.allowed, false);
    assert.ok(blocked.retryAfterSeconds > 0);
    now += 60_001;
    assert.equal(limiter.consume("k", rule).allowed, true);
  });

  it("supports failures-only rules used by sign-in", () => {
    const limiter = new FixedWindowRateLimiter(() => 0);
    const rule = { limit: 2, windowMs: 60_000 };
    assert.equal(limiter.peek("login", rule).allowed, true);
    limiter.recordFailure("login", rule);
    limiter.recordFailure("login", rule);
    assert.equal(limiter.peek("login", rule).allowed, false);
    limiter.reset("login");
    assert.equal(limiter.peek("login", rule).allowed, true);
  });

  it("keeps keys independent", () => {
    const limiter = new FixedWindowRateLimiter(() => 0);
    const rule = { limit: 1, windowMs: 60_000 };
    assert.equal(limiter.consume("a", rule).allowed, true);
    assert.equal(limiter.consume("a", rule).allowed, false);
    assert.equal(limiter.consume("b", rule).allowed, true);
  });
});

describe("environment fail-closed checks", () => {
  it("rejects published placeholder secrets in production", () => {
    assert.equal(isWeakSecret("change-me-to-a-long-random-string"), true);
    assert.equal(isWeakSecret("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"), true);
    assert.throws(() =>
      resolveAuthSecret({ NODE_ENV: "production", AUTH_SECRET: "change-me-to-a-long-random-string" }),
    );
    assert.throws(() => resolveAuthSecret({ NODE_ENV: "production", AUTH_SECRET: "short" }));
  });

  it("accepts a strong production secret and never uses the dev fallback there", () => {
    const secret = "9f7b0e4d2a6c8b1f3e5d7c9a0b2d4f6e8a1c3b5d";
    assert.equal(resolveAuthSecret({ NODE_ENV: "production", AUTH_SECRET: secret }), secret);
    assert.equal(resolveAuthSecret({ NODE_ENV: "development", AUTH_SECRET: "short" }), DEVELOPMENT_AUTH_SECRET);
    assert.equal(resolveAuthSecret({ NODE_ENV: "test", AUTH_SECRET: "" }), DEVELOPMENT_AUTH_SECRET);
  });

  it("requires a valid APP_URL in production", () => {
    assert.throws(() => resolveAppUrl({ NODE_ENV: "production" }));
    assert.throws(() => resolveAppUrl({ NODE_ENV: "production", APP_URL: "javascript:alert(1)" }));
    assert.throws(() => resolveAppUrl({ NODE_ENV: "production", APP_URL: "http://quotes.example.com" }));
    assert.equal(
      resolveAppUrl({ NODE_ENV: "production", APP_URL: "https://quotes.example.com/app" }),
      "https://quotes.example.com",
    );
    assert.equal(resolveAppUrl({ NODE_ENV: "development" }), "http://localhost:3000");
  });
});

describe("AI provider URL guard", () => {
  it("allows a normal public https endpoint in production", () => {
    const result = validateAiBaseUrl("https://api.openai.com/v1/", { NODE_ENV: "production" });
    assert.equal(result.ok, true);
    assert.equal(result.url, "https://api.openai.com/v1");
  });

  it("rejects embedded credentials and non-http schemes", () => {
    assert.equal(validateAiBaseUrl("https://user:pass@example.com/v1", { NODE_ENV: "production" }).ok, false);
    assert.equal(validateAiBaseUrl("file:///etc/passwd", { NODE_ENV: "production" }).ok, false);
  });

  it("blocks private/link-local targets in production unless explicitly allowed", () => {
    assert.equal(validateAiBaseUrl("http://169.254.169.254/latest", { NODE_ENV: "production" }).ok, false);
    assert.equal(validateAiBaseUrl("http://127.0.0.1:11434/v1", { NODE_ENV: "production" }).ok, false);
    assert.equal(
      validateAiBaseUrl("http://127.0.0.1:11434/v1", {
        NODE_ENV: "production",
        AI_ALLOW_PRIVATE_BASE_URL: "1",
      }).ok,
      true,
    );
    assert.equal(validateAiBaseUrl("http://localhost:11434/v1", { NODE_ENV: "development" }).ok, true);
  });
});

describe("AI settings schema", () => {
  it("normalises a safe URL and rejects credentials or file URLs", () => {
    const ok = aiSettingsSchema.safeParse({
      aiEnabled: true,
      aiBaseUrl: "https://api.openai.com/v1/",
      aiModel: "gpt-4o-mini",
    });
    assert.equal(ok.success, true);
    if (ok.success) assert.equal(ok.data.aiBaseUrl, "https://api.openai.com/v1");
    assert.equal(
      aiSettingsSchema.safeParse({
        aiEnabled: true,
        aiBaseUrl: "https://user:pass@example.com/v1",
        aiModel: "x",
      }).success,
      false,
    );
    assert.equal(
      aiSettingsSchema.safeParse({ aiEnabled: true, aiBaseUrl: "file:///etc/passwd", aiModel: "x" })
        .success,
      false,
    );
  });
});

describe("same-origin checks for upload routes", () => {
  it("accepts same-origin browser requests", () => {
    assert.equal(
      isSameOriginRequest({
        origin: "https://quotes.example.com",
        requestOrigin: "https://quotes.example.com",
        secFetchSite: "same-origin",
      }),
      true,
    );
  });

  it("accepts the same host when TLS terminates at the proxy", () => {
    assert.equal(
      isSameOriginRequest({
        origin: "https://quotes.example.com",
        requestOrigin: "http://quotes.example.com",
        secFetchSite: "same-origin",
      }),
      true,
    );
  });

  it("rejects cross-origin and sandboxed requests", () => {
    assert.equal(
      isSameOriginRequest({
        origin: "https://evil.example",
        requestOrigin: "https://quotes.example.com",
        secFetchSite: "cross-site",
      }),
      false,
    );
    assert.equal(isSameOriginRequest({ origin: "null", requestOrigin: "https://quotes.example.com" }), false);
    assert.equal(
      isSameOriginRequest({ requestOrigin: "https://quotes.example.com", secFetchSite: "cross-site" }),
      false,
    );
  });
});

describe("numeric denial-of-service guards", () => {
  it("rejects absurd money/rate/percentage strings", () => {
    assert.throws(() => parseMoneyToMinor("9".repeat(10_000), "MWK"));
    assert.throws(() => parseMoneyToMinor("9999999999999999", "MWK"));
    assert.throws(() => parseRateToMicro("9999999999"));
    assert.throws(() => parsePercentToBps("999999"));
    assert.equal(parseMoneyToMinor("1758488.00", "MWK"), 175_848_800n);
  });

  it("caps a giant sequence padding template", () => {
    const rendered = renderNumber("QT-{SEQ:999999999}", 7, new Date("2026-10-31T00:00:00Z"));
    assert.equal(rendered, "QT-000000000007");
  });
});
