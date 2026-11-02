import { Button } from "@/components/ui/button";

import { Checkbox } from "@/components/ui/checkbox";

import { Input } from "@/components/ui/input";

import { ConfirmButton } from "@/components/confirm-button";
import { RecoveryCodesForm } from "@/components/recovery-codes-form";
import { TwoFactorSetup } from "@/components/two-factor-setup";
import { Alert, Card, Field, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/dates";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { getSettings } from "@/server/settings";
import {
  disableTwoFactorAction,
  revokeOtherSessionsAction,
  revokeSessionAction,
  saveTwoFactorPolicyAction,
} from "@/server/actions/two-factor";

export const dynamic = "force-dynamic";

export default async function SecuritySettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string; required?: string }>;
}) {
  const user = await requireUser();
  const query = await searchParams;
  const [settings, sessions, roles] = await Promise.all([
    getSettings(),
    prisma.session.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
    prisma.role.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="max-w-4xl">
      <PageHeader
        eyebrow="Settings"
        title="Security"
        subtitle="Two-factor authentication, recovery codes and signed-in sessions."
      />
      {query.error ? <Alert tone="error">{query.error}</Alert> : null}
      {query.saved ? <Alert tone="success">Saved.</Alert> : null}
      {query.required ? (
        <Alert tone="warning" title="Two-factor authentication is required for your role">
          Enrol an authenticator below to comply with the current policy.
        </Alert>
      ) : null}

      <div className="space-y-6">
        <Card
          title="Two-factor authentication"
          subtitle={user.twoFactorEnabled ? "Enabled with an authenticator app." : "Not enabled."}
        >
          {user.twoFactorEnabled ? (
            <div className="space-y-5">
              <p className="text-sm text-muted-foreground">
                You sign in with your password and a six-digit code. Recovery codes work once each.
              </p>
              <div className="border-t border-border/70 pt-4">
                <RecoveryCodesForm />
              </div>
              <form action={disableTwoFactorAction} className="flex flex-wrap items-end gap-2 border-t border-border/70 pt-4">
                <Field label="Password" htmlFor="disablePassword">
                  <Input id="disablePassword" name="password" type="password" required autoComplete="current-password" />
                </Field>
                <ConfirmButton variant="destructive" message="Disable two-factor authentication? Recovery codes stop working.">
                  Disable 2FA
                </ConfirmButton>
              </form>
            </div>
          ) : (
            <TwoFactorSetup />
          )}
        </Card>

        <Card title={`Sessions (${sessions.length})`} subtitle="Revoke any session you do not recognise">
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sessions recorded.</p>
          ) : (
            <ul className="divide-y divide-border">
              {sessions.map((session) => (
                <li key={session.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium [overflow-wrap:anywhere]">
                      {session.userAgent
                        ? session.userAgent.length > 90
                          ? `${session.userAgent.slice(0, 90)}…`
                          : session.userAgent
                        : "Unknown browser"}
                    </p>
                    <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      {session.ipAddress ?? "unknown IP"} · signed in {formatDateTime(session.createdAt)} · expires {formatDateTime(session.expiresAt)}
                    </p>
                  </div>
                  <form action={revokeSessionAction}>
                    <Input type="hidden" name="sessionId" value={session.id} />
                    <Button variant="ghost" type="submit" className="px-2 py-1 text-xs text-red-600 dark:text-red-400">
                      Revoke
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          {sessions.length > 1 ? (
            <form action={revokeOtherSessionsAction} className="mt-4 border-t border-border/70 pt-4">
              <ConfirmButton variant="destructive" message="Revoke every session, including this one?">
                Sign out everywhere
              </ConfirmButton>
            </form>
          ) : null}
        </Card>

        {user.role === "admin" ? (
          <Card title="Per-role 2FA policy" subtitle="Optional: prompt these roles to enrol at sign-in">
            <form action={saveTwoFactorPolicyAction} className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                {roles.map((role) => (
                  <label key={role.key} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      name="roles"
                      value={role.key}
                      defaultChecked={settings.requireTwoFactorRoles.includes(role.key)}
                    />
                    {role.name}
                  </label>
                ))}
              </div>
              <Button variant="secondary" type="submit">Save policy</Button>
            </form>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
