import { expect, test } from "@playwright/test";

import { chooseOption, fillDateTime } from "./select";

/**
 * Permission checks: roles see only what they should, and a
 * viewer never receives cost, rate, margin or profit data — verified on the
 * pages that carry it, not just by hiding buttons.
 */
const stamp = Date.now().toString(36).toUpperCase();

async function signIn(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("a quotation draft carries internal pricing for an agent", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(
    page,
    process.env.E2E_ADMIN_EMAIL ?? "admin@example.com",
    process.env.E2E_ADMIN_PASSWORD ?? "ChangeMe12345",
  );

  // Build a minimal draft through the real flow.
  await page.goto("/customers/new");
  await page.fill("#name", `Perm Contact ${stamp}`);
  await chooseOption(page, page.locator("#type"), "Individual");
  await page.click('button[type="submit"]');
  await expect(page.getByRole("heading", { name: `Perm Contact ${stamp}` })).toBeVisible();
  await page.waitForLoadState("networkidle");
  const passengerFirstName = `Perm${stamp.replace(/[^A-Za-z]/g, "")}`.slice(0, 20);
  await page.fill('input[name="firstName"]', passengerFirstName);
  await page.fill('input[name="lastName"]', "Pax");
  await page.click('button:has-text("Add passenger")');
  await expect(page.getByText(passengerFirstName).first()).toBeVisible({ timeout: 20_000 });

  await page.goto("/quotations/new");
  await chooseOption(page, page.locator("#contactId"), `Perm Contact ${stamp}`);
  await page.click('button[type="submit"]');
  await expect(page.getByRole("button", { name: "Save draft" })).toBeVisible();
  const draftUrl = page.url();

  await page.click('button:has-text("+ Add flight")');
  const row = page.locator("table").filter({ hasText: "Airline" }).first().locator("tbody tr").first();
  await row.locator("input").nth(0).fill("ET");
  await row.locator("input").nth(1).fill("875");
  await row.locator("input").nth(2).fill("BLZ");
  await row.locator("input").nth(3).fill("ADD");
  await fillDateTime(page, row, 0, "2027-05-04T06:20");
  await fillDateTime(page, row, 1, "2027-05-04T12:35");
  await page.click('button:has-text("+ Add passenger")');
  const fare = page.locator("table").filter({ hasText: "Cost (" }).first().locator("tbody tr").first();
  await fare.locator('input[inputmode="decimal"]').first().fill("620.00");
  await page.click('button:has-text("Save draft")');
  await expect(page.getByText("Draft saved")).toBeVisible();

  // The agent/admin sees the internal panel.
  await expect(page.getByText("Internal pricing")).toBeVisible();
  await expect(page.getByText("Profit (markup)")).toBeVisible();
  await context.close();

  // A viewer opening the same draft gets the customer document only.
  const viewerContext = await browser.newContext();
  const viewer = await viewerContext.newPage();
  await signIn(viewer, "viewer@example.com", process.env.E2E_VIEWER_PASSWORD ?? "ChangeMe12345");
  await viewer.goto(draftUrl);
  await expect(viewer.getByText("Customer-facing view")).toBeVisible();
  for (const secret of ["Internal pricing", "Markup", "Profit", "Exchange rate", "Cost currency"]) {
    await expect(viewer.getByText(secret)).toHaveCount(0);
  }
  await expect(viewer.getByText("Perm Contact " + stamp).first()).toBeVisible();
  await viewerContext.close();
});

test("a viewer cannot open settings or the payment ledger", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, "viewer@example.com", process.env.E2E_VIEWER_PASSWORD ?? "ChangeMe12345");

  for (const path of ["/settings/users", "/settings/company", "/payments", "/customers/new"]) {
    await page.goto(path);
    // The guard redirects to the dashboard, which greets the user by name.
    await expect(page).toHaveURL(/\/dashboard(\?denied=1)?$/);
    await expect(page.getByRole("link", { name: "Users" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Company" })).toHaveCount(0);
  }
  await context.close();
});
