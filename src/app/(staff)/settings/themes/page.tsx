import { Card, PageHeader } from "@/components/ui";
import { ThemePicker } from "@/components/theme-picker";
import { requireUser } from "@/server/auth";

export const dynamic = "force-dynamic";

export default async function ThemesSettingsPage() {
  await requireUser();

  return (
    <div className="max-w-5xl">
      <PageHeader
        eyebrow="Settings"
        title="Themes"
        subtitle="Choose the colours used across the quotation system. Every theme keeps the same layout and applies a subtle tint to the page, sidebar, cards, tables, charts and hover states."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card
          title="Colour themes"
          subtitle="Pick a preset or build your own. The choice is remembered in this browser."
        >
          <ThemePicker />
        </Card>

        <div className="space-y-6">
          <Card title="Logo palette">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md bg-[#1e3a8a] p-3 text-white">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em]">Blue</p>
                <p className="mt-1 text-xs text-white/75">#1E3A8A</p>
              </div>
              <div className="rounded-md bg-[#f15f2c] p-3 text-[#0b1533]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em]">Orange</p>
                <p className="mt-1 text-xs text-[#0b1533]/70">#F15F2C</p>
              </div>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              The logo&apos;s deep royal blue and sunset orange anchor eleven presets, including five
              complementary palettes such as Emerald Coast. The builder uses the same colour system
              for any two colours you choose.
            </p>
          </Card>

          <Card title="Good to know">
            <ul className="space-y-2.5 text-[13px] leading-relaxed text-muted-foreground">
              <li>Each theme works in both light and dark mode.</li>
              <li>Cards, tables, charts and hover states pick up the same tint.</li>
              <li>Custom themes get matching page and sidebar tints, table hover and readable text.</li>
              <li>Light, dark or system appearance is set from the top bar.</li>
              <li>Printed quotations and invoices keep their own template colours.</li>
              <li>The choice is stored on this device, so other staff keep their own theme.</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
