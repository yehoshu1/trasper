import type { Locator, Page } from "@playwright/test";

/**
 * Choose an option from a shadcn (Radix) select.
 *
 * The trigger is a button with role="combobox"; the options render in a
 * portal with role="option", so native `selectOption` no longer applies.
 */
export async function chooseOption(page: Page, trigger: Locator, option: string) {
  await trigger.click();
  await page.getByRole("option", { name: option, exact: true }).click();
}
