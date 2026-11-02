import Link from "next/link";

import { TwoFactorLoginForm } from "@/components/two-factor-login-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { getCurrentUser } from "@/server/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function TwoFactorLoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Two-factor verification</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Enter the six-digit code from your authenticator app.
            </p>
          </div>
          <ThemeToggle />
        </div>
        <TwoFactorLoginForm />
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Lost your authenticator? Use one of your recovery codes, or ask an administrator.{" "}
          <Link href="/login" className="font-semibold underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
