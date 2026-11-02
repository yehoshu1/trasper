import { Button } from "@/components/ui/button";

import { redirect } from "next/navigation";

import { TwoFactorSetup } from "@/components/two-factor-setup";
import { Card, PageHeader } from "@/components/ui";
import { requiresTwoFactorEnrolment } from "@/lib/two-factor-policy";
import { getCurrentUser } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { signOutAction } from "@/server/actions/auth";

export const dynamic = "force-dynamic";

/**
 * Enrolment gate for a per-role 2FA policy. This route deliberately does not
 * use requireUser(): doing so would loop when the policy is enforced.
 */
export default async function EnrolTwoFactorPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const settings = await getSettings();
  const required = requiresTwoFactorEnrolment({
    role: user.role,
    enabled: user.twoFactorEnabled,
    requiredRoles: settings.requireTwoFactorRoles,
  });
  if (!required) redirect("/dashboard");

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-3xl flex-col justify-center p-6">
      <PageHeader
        eyebrow="Security"
        title="Two-factor authentication is required"
        subtitle={`Your role (${user.roleName || user.role}) must enrol an authenticator before the quotation system can be used.`}
      />
      <Card title="Enrol an authenticator" subtitle="Scan the QR code, save the recovery codes and confirm a six-digit code.">
        <TwoFactorSetup />
      </Card>
      <form action={signOutAction} className="mt-4">
        <Button variant="secondary" type="submit">
          Sign out
        </Button>
      </form>
    </main>
  );
}
