import { expect, test, type Page } from "@playwright/test";

import { chooseOption, fillDateTime } from "./select";

/**
 * End-to-end flow:
 * contact → quotation with two options → send → accept → itinerary →
 * pro forma → part payment → balance → paid.
 *
 * Uses unique names per run so the suite is repeatable against one database.
 */
const stamp = Date.now().toString(36).toUpperCase();
const contactName = `E2E Travel ${stamp}`;

test.describe.configure({ mode: "serial" });

let quotationUrl = "";
let page: Page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await page.goto("/login");
  await page.fill("#email", process.env.E2E_ADMIN_EMAIL ?? "admin@example.com");
  await page.fill("#password", process.env.E2E_ADMIN_PASSWORD ?? "ChangeMe12345");
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/dashboard$/);
});

test.afterAll(async () => {
  await page.close();
});

test("sign in as admin", async () => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
});

test("create a contact", async () => {
  await page.goto("/customers/new");
  await page.fill("#name", contactName);
  await chooseOption(page, page.locator("#type"), "Organisation");
  await page.fill("#attention", "Accounts");
  await page.fill("#email", `accounts+${stamp}@example.com`);
  await page.fill("#city", "Lilongwe");
  await page.click('button[type="submit"]');

  await expect(page.getByRole("heading", { name: contactName })).toBeVisible();
});

test("link a passenger to the contact", async () => {
  // The contact page embeds a "new passenger" form.
  await page.goto("/customers");
  await page.click(`text=${contactName}`);
  await expect(page.getByRole("heading", { name: contactName })).toBeVisible();
  await page.waitForLoadState("networkidle");

  // Add the first traveller directly on the contact page.
  const firstName = `Trav${stamp.replace(/[^A-Za-z]/g, "")}`.slice(0, 20);
  await page.fill(`input[name="firstName"]`, firstName);
  await page.fill(`input[name="lastName"]`, "Traveller");
  await expect(page.locator('input[name="firstName"]')).toHaveValue(firstName);
  await page.click('button:has-text("Add passenger")');
  await expect(page.getByText(`${firstName} Traveller`)).toBeVisible({ timeout: 20_000 });
});

test("create a quotation with two options", async () => {
  await page.goto("/quotations/new");
  // The option label is "Name — City" when the contact has a city.
  await chooseOption(page, page.locator("#contactId"), `${contactName} — Lilongwe`);
  await page.click('button[type="submit"]');

  // The editor opens for the new draft.
  await expect(page.getByRole("button", { name: "Save draft" })).toBeVisible();

  // --- Option A: one flight, one fare -------------------------------------
  await page.click('button:has-text("+ Add flight")');
  const segmentRow = page.locator("table").filter({ hasText: "Airline" }).first().locator("tbody tr").first();
  await segmentRow.locator("input").nth(0).fill("ET");
  await segmentRow.locator("input").nth(1).fill("875");
  await segmentRow.locator("input").nth(2).fill("BLZ");
  await segmentRow.locator("input").nth(3).fill("ADD");
  await fillDateTime(page, segmentRow, 0, "2027-03-10T06:20");
  await fillDateTime(page, segmentRow, 1, "2027-03-10T12:35");

  await page.click('button:has-text("+ Add passenger")');
  const fareRow = page.locator("table").filter({ hasText: "Cost (" }).first().locator("tbody tr").first();
  await fareRow.locator('input[inputmode="decimal"]').first().fill("620.00");

  // --- Option B: second option, same shape --------------------------------
  await page.click('button:has-text("+ Add option")');
  await page.click('button:has-text("+ Add flight")');
  const segmentB = page.locator("table").filter({ hasText: "Airline" }).first().locator("tbody tr").first();
  await segmentB.locator("input").nth(0).fill("ET");
  await segmentB.locator("input").nth(1).fill("920");
  await segmentB.locator("input").nth(2).fill("BLZ");
  await segmentB.locator("input").nth(3).fill("NBO");
  await fillDateTime(page, segmentB, 0, "2027-03-17T07:45");
  await fillDateTime(page, segmentB, 1, "2027-03-17T11:10");

  await page.click('button:has-text("+ Add passenger")');
  const fareB = page.locator("table").filter({ hasText: "Cost (" }).first().locator("tbody tr").first();
  await fareB.locator('input[inputmode="decimal"]').first().fill("540.00");

  // Internal pricing panel shows a total for both options.
  await expect(page.getByText("Internal pricing")).toBeVisible();
  await expect(page.getByText("Grand total")).toBeVisible();

  await page.click('button:has-text("Save draft")');
  await expect(page.getByText("Draft saved")).toBeVisible();

  quotationUrl = page.url();
  expect(quotationUrl).toMatch(/\/quotations\/[a-z0-9]+$/i);
});

test("send and accept one option", async () => {
  await page.goto(quotationUrl);

  page.once("dialog", (dialog) => dialog.accept());
  await page.click('button:has-text("Mark sent")');

  // The quotation is now locked and offers Accept / Decline.
  await expect(page.getByRole("button", { name: "Accept Option A" })).toBeVisible({ timeout: 20_000 });
  await page.click('button:has-text("Accept Option A")');
  await expect(page.getByText("Accepted Option A").first()).toBeVisible({ timeout: 20_000 });
});

test("issue an itinerary from the accepted option", async () => {
  await page.goto(quotationUrl);
  await page.click('button:has-text("Create itinerary")');
  await expect(page).toHaveURL(/\/itineraries\/[a-z0-9]+$/i, { timeout: 20_000 });

  // Frozen snapshot: the itinerary shows the flight that was issued.
  await expect(page.getByText("ET").first()).toBeVisible();
  await expect(page.getByText("BLZ → ADD").first()).toBeVisible();
});

test("issue a pro forma and pay it in two steps", async () => {
  await page.goto(quotationUrl);
  await page.click('button:has-text("Create pro forma")');
  await expect(page).toHaveURL(/\/proformas\/[a-z0-9]+$/i, { timeout: 20_000 });

  // Status starts Unpaid.
  await expect(page.getByText("Unpaid").first()).toBeVisible();

  // Part payment: half the balance.
  const amountInput = page.locator('#amount');
  const total = await amountInput.inputValue();
  const [whole, fraction = "00"] = total.split(".");
  const halfMinor = Math.floor(Number(whole.replace(/,/g, "")) / 2);
  await amountInput.fill(`${halfMinor}.${fraction}`);
  await page.click('button:has-text("Record payment")');

  await expect(page.getByText("Part-paid").first()).toBeVisible({ timeout: 20_000 });

  // Balance: pay the rest.
  await page.locator('#amount').fill(total);
  await page.click('button:has-text("Record payment")');
  await expect(page.getByText("Paid").first()).toBeVisible({ timeout: 20_000 });
});

test("the payment ledger lists both receipts", async () => {
  await page.goto(`/payments?q=${encodeURIComponent(contactName)}`);
  await expect(page.getByText(contactName).first()).toBeVisible();
});

test("quotations download as a PDF", async () => {
  await page.goto(quotationUrl);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.click('a:has-text("Download PDF")'),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
});

test("an admin cancels the accepted quotation", async () => {
  await page.goto(quotationUrl);
  await page.fill('input[name="reason"]', "Client cancelled after acceptance");
  await page.click('button:has-text("Cancel accepted quotation")');
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Cancel accepted quotation" })
    .click();
  await expect(page.getByText(/Client cancelled after acceptance —/)).toBeVisible({
    timeout: 20_000,
  });
});

test("does not offer permanent delete for a customer with documents", async () => {
  await page.goto(`/customers?q=${encodeURIComponent(contactName)}`);
  await page.getByRole("link", { name: contactName }).first().click();
  await expect(page.getByRole("button", { name: "Delete customer" })).toHaveCount(0);
  await expect(
    page.getByText("Customers with quotations or itineraries can only be archived."),
  ).toBeVisible();
});

test("deletes an unreferenced customer", async () => {
  const name = `E2E Delete ${stamp}`;
  await page.goto("/customers/new");
  await page.fill("#name", name);
  await page.click('button[type="submit"]');
  await expect(page.getByRole("heading", { name })).toBeVisible();

  await page.click('button:has-text("Delete customer")');
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete customer" })
    .click();
  await expect(page).toHaveURL(/\/customers\?deleted=1/);
  await expect(page.getByText("Customer deleted.")).toBeVisible();
  await expect(page.getByText(name)).toHaveCount(0);
});
