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

/**
 * Set a DateTimePicker to a local `yyyy-MM-ddTHH:mm` value.
 *
 * The picker is a popover, not a native `datetime-local` input: open the
 * trigger, move the calendar to the target month, click the exact day cell and
 * type the time. `cellIndex` counts from the row's "Departs" cell, so 0 is
 * departure and 1 is arrival.
 */
export async function fillDateTime(
  page: Page,
  row: Locator,
  cellIndex: number,
  value: string,
): Promise<void> {
  const [date, time] = value.split("T");
  const trigger = row.locator("td").nth(4 + cellIndex).getByRole("button");
  await trigger.click();

  const dialog = page.locator('[role="dialog"]');
  const day = dialog.locator(`[data-day="${date}"] button`);
  if ((await day.count()) === 0) {
    const target = new Date(`${date}T00:00:00`);
    const today = new Date();
    const forward =
      target.getFullYear() > today.getFullYear() ||
      (target.getFullYear() === today.getFullYear() && target.getMonth() >= today.getMonth());
    const nav = dialog.getByRole("button", {
      name: forward ? "Go to the Next Month" : "Go to the Previous Month",
    });
    for (let i = 0; i < 60 && (await day.count()) === 0; i += 1) {
      // The calendar caption sits over the nav button in the popover, so a
      // pointer click is intercepted. Dispatch the click on the button itself.
      await nav.evaluate((element) => (element as HTMLButtonElement).click());
    }
  }
  await day.click();
  await dialog.locator('input[type="time"]').fill(time);
  await dialog.getByRole("button", { name: "Done" }).click();
}
