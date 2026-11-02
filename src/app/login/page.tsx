import { redirect } from "next/navigation";
import { CalendarCheck2, FileCheck2, LockKeyhole, Plane } from "lucide-react";

import { LoginForm } from "@/components/login-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { getCurrentUser } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { timeZoneLabel } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
  const settings = await getSettings();
  const zoneLabel = timeZoneLabel(settings.timeZone);
  const logo = settings.companyHeaderImage || settings.companyLetterheadImage;

  return (
    <main className="grid min-h-svh bg-background lg:grid-cols-2">
      <section className="relative hidden flex-col justify-between border-r bg-muted/40 p-10 lg:flex">
        <div className="flex items-center gap-2.5">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/api/company-logo"
              alt={settings.companyName}
              className="h-10 w-10 rounded-lg bg-white object-contain p-1 ring-1 ring-black/5"
            />
          ) : (
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Plane className="h-4 w-4" />
            </span>
          )}
          <span className="text-sm font-semibold tracking-tight">{settings.companyName}</span>
        </div>

        <div className="max-w-md">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight">
            Quote from a pasted PNR, or from scratch.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            One workspace for customers, quotations, itineraries and payments — branded documents
            with a clear record of every change.
          </p>
          <ul className="mt-8 space-y-3 text-sm">
            <li className="flex items-start gap-2.5">
              <CalendarCheck2 className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <span>Import a PNR when you have one, or enter the flights and travellers yourself.</span>
            </li>
            <li className="flex items-start gap-2.5">
              <FileCheck2 className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <span>Build branded itineraries and pro forma invoices from the same customer record.</span>
            </li>
            <li className="flex items-start gap-2.5">
              <LockKeyhole className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <span>Sending freezes the document; revisions supersede, never overwrite.</span>
            </li>
          </ul>
        </div>

        <p className="text-xs text-muted-foreground">
          {zoneLabel} · English (UK) · {new Date().getFullYear()}
        </p>
      </section>

      <section className="relative flex items-center justify-center p-6 sm:p-10">
        <div className="absolute right-4 top-4">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src="/api/company-logo"
                alt={settings.companyName}
                className="h-10 w-10 rounded-lg bg-white object-contain p-1 ring-1 ring-black/5"
              />
            ) : (
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Plane className="h-4 w-4" />
              </span>
            )}
            <span className="text-sm font-semibold tracking-tight">{settings.companyName}</span>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
          <p className="mb-6 mt-1.5 text-sm text-muted-foreground">
            Use your {settings.companyName} staff account to continue.
          </p>
          <LoginForm />
          <p className="mt-8 text-center text-xs text-muted-foreground">
            Trasper · Staff access only · {zoneLabel} · {new Date().getFullYear()}
          </p>
        </div>
      </section>
    </main>
  );
}
