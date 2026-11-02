import { expect, test } from "@playwright/test";

test("the landing page is public and explains the product", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "From a pasted PNR — or a blank page — to documents your client keeps.",
    }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Everything after the enquiry." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Staff sign in" }).first()).toHaveAttribute(
    "href",
    "/login",
  );
  await expect(page.getByRole("link", { name: "Features" }).first()).toHaveAttribute(
    "href",
    "#features",
  );
  await expect(page.getByRole("link", { name: "Docs", exact: true })).toHaveAttribute(
    "href",
    "/docs",
  );
  await expect(page.getByRole("link", { name: "Read the staff guide" })).toHaveAttribute(
    "href",
    "/docs",
  );
  await expect(page.getByRole("link", { name: "View Trasper on GitHub" })).toHaveAttribute(
    "href",
    "https://github.com/yehoshu1/trasper",
  );
  await expect(page.getByRole("link", { name: "GitHub", exact: true })).toHaveAttribute(
    "href",
    "https://github.com/yehoshu1/trasper",
  );
});

test("the staff dashboard still requires a session", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
});
