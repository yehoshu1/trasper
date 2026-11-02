import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";

import { chooseOption, fillDateTime } from "./select";

/**
 * Delivery flows:
 *  - compose → send → appears in Sent;
 *  - open an inbox message and link it to a quotation;
 *  - choose a non-default bank account and prove the issued PDF stays frozen
 *    after the live account details are changed.

 */
const stamp = Date.now().toString(36).toUpperCase();
const bankDefault = `E2E Default MWK ${stamp}`;
const bankAlternate = `E2E Alternate MWK ${stamp}`;

test.describe.configure({ mode: "serial" });

let page: Page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await signIn(page);
});

test.afterAll(async () => {
  await page.close();
});

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.fill("#email", process.env.E2E_ADMIN_EMAIL ?? "admin@example.com");
  await page.fill("#password", process.env.E2E_ADMIN_PASSWORD ?? "ChangeMe12345");
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function createCustomer(page: import("@playwright/test").Page, name: string) {
  await page.goto("/customers/new");
  await page.fill("#name", name);
  await chooseOption(page, page.locator("#type"), "Organisation");
  await page.fill("#email", `bank+${stamp}@example.com`);
  await page.fill("#city", "Lilongwe");
  await page.click('button[type="submit"]');
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

async function createDraftQuotation(
  page: import("@playwright/test").Page,
  name: string,
  addPassengerAndOption = false,
) {
  if (addPassengerAndOption) {
    await page.waitForLoadState("networkidle");
    const firstName = `Bank${stamp.replace(/[^A-Za-z]/g, "")}`.slice(0, 18);
    await page.fill('input[name="firstName"]', firstName);
    await page.fill('input[name="lastName"]', "Traveller");
    await expect(page.locator('input[name="firstName"]')).toHaveValue(firstName);
    await page.click('button:has-text("Add passenger")');
    await expect(page.getByText(firstName).first()).toBeVisible({ timeout: 20_000 });
  }

  await page.goto("/quotations/new");
  await chooseOption(page, page.locator("#contactId"), `${name} — Lilongwe`);
  await page.click('button[type="submit"]');
  await expect(page.getByRole("button", { name: "Save draft" })).toBeVisible();
  const heading = await page.locator("h1").first().innerText();
  const number = heading.split("·")[0]?.trim() ?? "";
  expect(number).toMatch(/^QT/);
  return { number, url: page.url() };
}

async function addOnePricedSegment(page: import("@playwright/test").Page) {
  await page.click('button:has-text("+ Add flight")');
  const segmentRow = page.locator("table").filter({ hasText: "Airline" }).first().locator("tbody tr").first();
  await segmentRow.locator("input").nth(0).fill("ET");
  await segmentRow.locator("input").nth(1).fill("875");
  await segmentRow.locator("input").nth(2).fill("BLZ");
  await segmentRow.locator("input").nth(3).fill("ADD");
  await fillDateTime(page, segmentRow, 0, "2027-05-10T06:20");
  await fillDateTime(page, segmentRow, 1, "2027-05-10T12:35");

  await page.click('button:has-text("+ Add passenger")');
  const fareRow = page.locator("table").filter({ hasText: "Cost (" }).first().locator("tbody tr").first();
  await fareRow.locator('input[inputmode="decimal"]').first().fill("100.00");
}

function pdfContent(buffer: Buffer): string {
  const raw = buffer.toString("latin1");
  const chunks = [raw];
  const stream = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;
  while ((match = stream.exec(raw))) {
    try {
      chunks.push(inflateSync(Buffer.from(match[1], "latin1")).toString("latin1"));
    } catch {
      // Some streams are uncompressed or use another filter.
    }
  }
  const text: string[] = [];
  for (const chunk of chunks) {
    for (const match of chunk.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) {
      try {
        text.push(Buffer.from(match[1], "hex").toString("latin1"));
      } catch {
        // Ignore malformed hex strings.
      }
    }
  }
  return [...chunks, ...text].join("\n");
}

async function downloadPdf(page: import("@playwright/test").Page): Promise<Buffer> {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Download PDF" }).first().click(),
  ]);
  const file = await download.path();
  expect(file).toBeTruthy();
  const bytes = await readFile(file!);
  expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
  return bytes;
}

test("a non-default bank account is frozen into the issued PDF", async () => {

  // Two accounts: one default, one deliberately not default.
  await page.goto("/settings/banks");
  await page.fill("#label", bankDefault);
  await page.fill("#bankName", "E2E Default Bank");
  await page.fill("#accountName", "E2E Default");
  await page.fill("#accountNumber", `D-${stamp}`);
  await chooseOption(page, page.locator("#currency"), "MWK");
  await page.check('input[name="isDefault"]');
  await page.click('button:has-text("Save account")');
  await expect(page.getByText("Saved.").first()).toBeVisible();

  await page.goto("/settings/banks");
  await page.fill("#label", bankAlternate);
  await page.fill("#bankName", "E2E Alternate Bank");
  await page.fill("#accountName", "E2E Alternate");
  await page.fill("#accountNumber", `A-${stamp}`);
  await chooseOption(page, page.locator("#currency"), "MWK");
  await page.uncheck('input[name="isDefault"]');
  await page.click('button:has-text("Save account")');
  await expect(page.getByText("Saved.").first()).toBeVisible();

  const alternateRow = page.locator("li").filter({ hasText: bankAlternate });
  const editHref = await alternateRow.getByRole("link", { name: "Edit" }).getAttribute("href");
  expect(editHref).toMatch(/\/settings\/banks\?id=/);

  const bankCustomer = `E2E Bank ${stamp}`;
  await createCustomer(page, bankCustomer);
  const { url: quotationUrl } = await createDraftQuotation(page, bankCustomer, true);

  const bankSelect = page.locator("#bankAccountId");
  await chooseOption(page, bankSelect, `${bankAlternate} · MWK`);

  await addOnePricedSegment(page);
  await page.click('button:has-text("Save draft")');
  await expect(page.getByText("Draft saved")).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.click('button:has-text("Mark sent")');
  await expect(page.getByRole("button", { name: "Accept Option A" })).toBeVisible({ timeout: 20_000 });

  const before = await downloadPdf(page);
  const beforeText = pdfContent(before);
  expect(beforeText).toContain("E2E Alternate");
  expect(beforeText).not.toContain("LIVE CHANGED");

  // Change the live account. The issued PDF must not change.
  await page.goto(editHref!);
  await page.fill("#accountName", "LIVE CHANGED — MUST NOT PRINT");
  await page.fill("#accountNumber", `LIVE-${stamp}`);
  await page.click('button:has-text("Save account")');
  await expect(page.getByText("Saved.").first()).toBeVisible();

  await page.goto(quotationUrl);
  const after = await downloadPdf(page);
  const afterText = pdfContent(after);
  expect(afterText).toContain("E2E Alternate");
  expect(afterText).not.toContain("LIVE CHANGED");
  expect(afterText).not.toContain(`LIVE-${stamp}`);
});
