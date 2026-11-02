"use client";

import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import { useActionState } from "react";

import { Alert, Field } from "@/components/ui";
import { changePasswordAction } from "@/server/actions/auth";

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, undefined);

  return (
    <form action={action} className="space-y-3">
      {state && !state.ok ? <Alert tone="error">{state.error ?? "Could not change the password"}</Alert> : null}
      {state?.ok ? <Alert tone="success">{state.message ?? "Password changed."}</Alert> : null}
      <Field label="Current password" htmlFor="currentPassword">
        <Input id="currentPassword" name="currentPassword" type="password" required autoComplete="current-password" />
      </Field>
      <Field label="New password" htmlFor="newPassword" hint="At least 10 characters, with a letter and a number">
        <Input id="newPassword" name="newPassword" type="password" required minLength={10} autoComplete="new-password" />
      </Field>
      <Button variant="default" type="submit" disabled={pending}>
        {pending ? "Changing…" : "Change password"}
      </Button>
    </form>
  );
}
