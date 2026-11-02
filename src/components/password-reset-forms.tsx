"use client";

import { Button } from "@/components/ui/button";

import { Label } from "@/components/ui/label";

import { Input } from "@/components/ui/input";

import Link from "next/link";
import { useActionState } from "react";

import {
  requestPasswordResetAction,
  resetPasswordWithTokenAction,
} from "@/server/actions/auth";
import type { ActionResult } from "@/server/actions/types";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(
    requestPasswordResetAction,
    undefined,
  );
  return (
    <form action={action} className="space-y-4">
      {state?.error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200" role="alert">
          {state.error}
        </div>
      ) : null}
      {state?.ok ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200" role="status">
          {state.message ?? "If that email is registered, a reset link has been sent."}
        </div>
      ) : null}
      <div>
        <Label htmlFor="email">Email address</Label>
        <Input id="email" name="email" type="email" required autoComplete="username" />
      </div>
      <Button variant="default" type="submit" className="w-full" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        <Link href="/login" className="font-semibold underline">Back to sign in</Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(
    resetPasswordWithTokenAction,
    undefined,
  );
  return (
    <form action={action} className="space-y-4">
      <Input type="hidden" name="token" value={token} />
      {state?.error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200" role="alert">
          {state.error}
        </div>
      ) : null}
      <div>
        <Label htmlFor="password">New password</Label>
        <Input id="password" name="password" type="password" required minLength={10} autoComplete="new-password" />
      </div>
      <div>
        <Label htmlFor="confirmPassword">Confirm new password</Label>
        <Input id="confirmPassword" name="confirmPassword" type="password" required minLength={10} autoComplete="new-password" />
      </div>
      <Button variant="default" type="submit" className="w-full" disabled={pending || !token}>
        {pending ? "Saving…" : "Set a new password"}
      </Button>
    </form>
  );
}
