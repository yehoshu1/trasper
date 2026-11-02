import { Button } from "@/components/ui/button";

import { Checkbox } from "@/components/ui/checkbox";

import { Input } from "@/components/ui/input";

import { ConfirmButton } from "@/components/confirm-button";
import { Alert, Card, Field, PageHeader } from "@/components/ui";
import { SelectField } from "@/components/ui/select";
import { safeAvatarUrl } from "@/lib/avatar";
import { formatDateTime } from "@/lib/dates";
import { requireCapableUser } from "@/server/auth";
import { prisma } from "@/server/db";
import {
  createUserAction,
  resetUserPasswordAction,
  sendStaffInviteAction,
  updateUserAction,
} from "@/server/actions/settings";

export const dynamic = "force-dynamic";

export default async function UsersSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string; reset?: string }>;
}) {
  const current = await requireCapableUser("manageUsers");
  const query = await searchParams;

  const [users, roles, branches] = await Promise.all([
    prisma.user.findMany({ orderBy: { name: "asc" } }),
    prisma.role.findMany({ orderBy: { name: "asc" } }),
    prisma.branch.findMany({ orderBy: { code: "asc" } }),
  ]);
  const roleName = (key: string) => roles.find((role) => role.key === key)?.name ?? key;
  const branchName = (code: string) => branches.find((branch) => branch.code === code)?.name ?? "";
  const staffUsers = users.map((user) => ({ ...user, image: safeAvatarUrl(user.image) }));

  return (
    <div className="max-w-5xl">
      <PageHeader
        eyebrow="Settings"
        title="Users"
        subtitle="Staff accounts are created here; sign-up is disabled. Passwords are hashed with Better Auth and shown nowhere."
      />

      {query.error ? <Alert tone="error">{query.error}</Alert> : null}
      {query.saved ? <Alert tone="success">Saved.</Alert> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card title={`Accounts (${staffUsers.length})`}>
          <ul className="divide-y divide-border">
            {staffUsers.map((user) => (
              <li key={user.id} className="py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    {user.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={user.image}
                        alt=""
                        className="h-8 w-8 shrink-0 rounded-lg bg-white object-cover ring-1 ring-black/5"
                      />
                    ) : (
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted text-[11px] font-semibold text-foreground">
                        {user.name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase()}
                      </span>
                    )}
                    <div>
                      <p className="font-semibold text-foreground">
                        {user.name}
                        {user.id === current.id ? (
                          <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-foreground">
                            You
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {user.email} · last sign-in{" "}
                        {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "never"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {roleName(user.role)} · branch {user.branch}
                        {branchName(user.branch) ? ` — ${branchName(user.branch)}` : ""}
                        {!user.active ? " · deactivated" : ""}
                      </p>
                    </div>
                  </div>
                  {user.active ? (
                    <span className="badge bg-emerald-100 text-emerald-800 dark:text-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300">Active</span>
                  ) : (
                    <span className="badge bg-muted text-muted-foreground">Inactive</span>
                  )}
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <form action={updateUserAction} className="flex flex-wrap items-end gap-2">
                    <Input type="hidden" name="userId" value={user.id} />
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Role
                      <SelectField
                        name="role"
                        className="mt-1 w-auto"
                        defaultValue={user.role}
                        options={roles.map((role) => ({
                          value: role.key,
                          label: role.active ? role.name : `${role.name} (inactive)`,
                        }))}
                      />
                    </label>
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Branch
                      <SelectField
                        name="branch"
                        className="mt-1 w-auto"
                        defaultValue={user.branch}
                        options={branches.map((branch) => ({
                          value: branch.code,
                          label: branch.active ? branch.code : `${branch.code} (inactive)`,
                        }))}
                      />
                    </label>
                    <label className="flex items-center gap-1.5 self-end pb-2 text-xs text-muted-foreground">
                      <Checkbox name="active" defaultChecked={user.active} />
                      Active
                    </label>
                    <Button variant="secondary" type="submit" className="px-2 py-1 text-xs">
                      Save
                    </Button>
                  </form>

                  <details className="text-sm">
                    <summary className="cursor-pointer text-xs font-semibold text-foreground">
                      Reset password
                    </summary>
                    <form action={resetUserPasswordAction} className="mt-2 flex flex-wrap items-end gap-2">
                      <Input type="hidden" name="userId" value={user.id} />
                      <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        New password
                        <Input
                          name="password"
                          type="password" className="mt-1 w-44"
                          required
                          minLength={10}
                          autoComplete="new-password"
                        />
                      </label>
                      <ConfirmButton variant="destructive" className="px-2 py-1 text-xs"
                        message={`Reset the password for ${user.name}? They are signed out everywhere.`}
                      >
                        Reset
                      </ConfirmButton>
                    </form>
                  </details>
                  <form action={sendStaffInviteAction} className="mt-2">
                    <Input type="hidden" name="userId" value={user.id} />
                    <Button variant="ghost" type="submit" className="px-2 py-1 text-xs">
                      Email invite / login link
                    </Button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Create a staff account">
          <form action={createUserAction} className="space-y-3">
            <Field label="Name" htmlFor="name">
              <Input id="name" name="name" required minLength={2} maxLength={120} />
            </Field>
            <Field label="Email" htmlFor="email">
              <Input id="email" name="email" type="email" required autoComplete="off" />
            </Field>
            <Field label="Role" htmlFor="role">
              <SelectField
                id="role"
                name="role"
                defaultValue="agent"
                options={roles
                  .filter((role) => role.active)
                  .map((role) => ({ value: role.key, label: role.name }))}
              />
            </Field>
            <Field label="Branch" htmlFor="new-branch" hint="Branches appear in quotation numbers">
              <SelectField
                id="new-branch"
                name="branch"
                defaultValue={current.branch}
                required
                options={branches
                  .filter((branch) => branch.active)
                  .map((branch) => ({ value: branch.code, label: `${branch.code} — ${branch.name}` }))}
              />
            </Field>
            <Field label="Temporary password" htmlFor="password" hint="At least 10 characters, with a letter and a number">
              <Input
                id="password"
                name="password"
                type="password"
                required
                minLength={10}
                autoComplete="new-password"
              />
            </Field>
            <Button variant="default" type="submit" className="w-full">
              Create account
            </Button>
          </form>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Tell the user to change their password after the first sign-in.
          </p>
        </Card>
      </div>

      <p className="mt-4 text-xs text-muted-foreground/70">
        Every role change and password reset is written to the audit log with your name.
      </p>
    </div>
  );
}
