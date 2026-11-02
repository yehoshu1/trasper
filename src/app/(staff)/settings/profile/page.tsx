import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import { AvatarUploadForm } from "@/components/avatar-upload";
import { PasswordForm } from "@/components/password-form";
import { Alert, Card, Field, PageHeader } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { updateProfileAction } from "@/server/actions/settings";

export const dynamic = "force-dynamic";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const user = await requireUser();
  const query = await searchParams;

  return (
    <div className="max-w-3xl">
      <PageHeader
        eyebrow="My account"
        title="Profile"
        subtitle="Your name, photo and sign-in password. The photo is shown in the sidebar and against your audit entries."
      />

      {query.error ? <Alert tone="error">{query.error}</Alert> : null}
      {query.saved ? <Alert tone="success">Saved.</Alert> : null}

      <div className="space-y-6">
        <Card title="Photo">
          <div className="flex flex-wrap items-center gap-4">
            {user.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.image} alt="" className="h-16 w-16 rounded-xl bg-white object-cover ring-1 ring-black/5" />
            ) : (
              <span className="grid h-16 w-16 place-items-center rounded-xl bg-muted text-lg font-semibold text-foreground">
                {user.name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase()}
              </span>
            )}
            <AvatarUploadForm />
          </div>
        </Card>

        <Card title="Details">
          <form action={updateProfileAction} className="space-y-3">
            <Field label="Name" htmlFor="name">
              <Input id="name" name="name" required minLength={2} maxLength={120} defaultValue={user.name} />
            </Field>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email</dt>
                <dd className="text-foreground">{user.email}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Role</dt>
                <dd className="text-foreground">{user.roleName}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Branch</dt>
                <dd className="text-foreground">{user.branch}{user.branchName ? ` — ${user.branchName}` : ""}</dd>
              </div>
            </dl>
            <Button variant="default" type="submit">Save profile</Button>
          </form>
        </Card>

        <Card title="Password" subtitle="Changing it signs you out of other sessions">
          <PasswordForm />
        </Card>
      </div>
    </div>
  );
}
