import { expect, test } from "@playwright/test";

test("shows the branded 404 for an unknown route", async ({ page }) => {
  const response = await page.goto("/this-page-does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "This page does not exist" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to home" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Staff sign in" })).toBeVisible();
});

test("keeps the documentation layout for a missing docs page", async ({ page }) => {
  const response = await page.goto("/docs/does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "Documentation page not found" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Documentation home" })).toBeVisible();
});
