import Link from "next/link";

import { ResetPasswordForm } from "@/components/password-reset-forms";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

/** The reset token is in the URL; never send it in a Referer header. */
export const metadata = { referrer: "no-referrer" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
        <PageHeader
          eyebrow="Account"
          title="Choose a new password"
          subtitle="Use at least 10 characters with a letter and a number."
        />
        <ResetPasswordForm token={params.token ?? ""} />
        <p className="mt-6 text-center text-xs text-muted-foreground">
          <Link href="/login" className="font-semibold underline">Back to sign in</Link>
        </p>
      </div>
    </main>
  );
}
