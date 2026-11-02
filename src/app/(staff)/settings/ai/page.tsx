import { Button } from "@/components/ui/button";

import { Checkbox } from "@/components/ui/checkbox";

import { Input } from "@/components/ui/input";

import Link from "next/link";

import { Alert, Card, Field, PageHeader } from "@/components/ui";
import { requireCapableUser } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { updateAiAction } from "@/server/actions/settings";

export const dynamic = "force-dynamic";

export default async function AiSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requireCapableUser("manageSettings");
  const query = await searchParams;
  const settings = await getSettings();
  const configured = Boolean(settings.aiApiKeyCipher);

  return (
    <div className="max-w-5xl">
      <PageHeader
        eyebrow="Settings"
        title="AI"
        subtitle="The Vercel AI SDK fallback for free-form itineraries. The deterministic PNR parser runs first; AI is only used when the pasted itinerary cannot be understood by rules."
      />

      {query.error ? <Alert tone="error">{query.error}</Alert> : null}
      {query.saved ? <Alert tone="success">AI settings saved.</Alert> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card title="Provider" subtitle="OpenAI or any OpenAI-compatible chat-completions endpoint">
          <form action={updateAiAction} className="grid gap-4">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <Checkbox name="aiEnabled" defaultChecked={settings.aiEnabled} />
              Enable AI conversion for itineraries
            </label>

            <Field
              label="API base URL"
              htmlFor="aiBaseUrl"
              hint="Examples: https://api.openai.com/v1 or https://openrouter.ai/api/v1"
            >
              <Input
                id="aiBaseUrl"
                name="aiBaseUrl"
                type="url"
                required
                defaultValue={settings.aiBaseUrl}
              />
            </Field>

            <Field label="Model" htmlFor="aiModel" hint="Use the exact model ID accepted by your provider">
              <Input
                id="aiModel"
                name="aiModel"
                required
                defaultValue={settings.aiModel}
                placeholder="gpt-4o-mini"
              />
            </Field>

            <Field
              label="API key"
              htmlFor="aiApiKey"
              hint={
                configured
                  ? "A key is already stored. Leave this blank to keep it."
                  : "Stored encrypted with AES-256-GCM; it is never sent to the browser."
              }
            >
              <Input
                id="aiApiKey"
                name="aiApiKey"
                type="password"
                autoComplete="new-password"
                placeholder={configured ? "••••••••  (stored)" : "sk-…"}
              />
            </Field>

            {configured ? (
              <label className="flex items-center gap-2 text-sm text-foreground">
                <Checkbox name="clearAiKey" />
                Remove the stored API key
              </label>
            ) : null}

            <div>
              <Button variant="default" type="submit">
                Save AI settings
              </Button>
            </div>
          </form>
        </Card>

        <div className="space-y-6">
          <Card title="How it is used">
            <ul className="space-y-2.5 text-[13px] leading-relaxed text-muted-foreground">
              <li>Rules parse normal PNR and standard itineraries without a model call.</li>
              <li>If rules cannot read a free-form itinerary, AI extracts the segments.</li>
              <li>The AI response is validated by Zod before a PNR is generated.</li>
              <li>The generated PNR is parsed again before it reaches the page.</li>
              <li>Nothing is saved to a quotation until you apply it.</li>
            </ul>
          </Card>

          <Card title="Try it">
            <p className="text-[13px] text-muted-foreground">
              Paste any itinerary on the PNR converter page. The result says whether rules or AI
              produced it.
            </p>
            <Link href="/tools/pnr" className="btn-secondary mt-3 inline-flex">
              Open PNR converter
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
