import { ForgotPasswordForm } from "@/components/password-reset-forms";
import { PageHeader } from "@/components/ui";
import { getCurrentUser } from "@/server/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
        <PageHeader
          eyebrow="Account"
          title="Reset your password"
          subtitle="We will send a reset link through the system mail service (Resend)."
        />
        <ForgotPasswordForm />
      </div>
    </main>
  );
}
