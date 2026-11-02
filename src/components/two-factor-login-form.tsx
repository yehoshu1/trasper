"use client";

import { Button } from "@/components/ui/button";

import { Label } from "@/components/ui/label";

import { Checkbox } from "@/components/ui/checkbox";

import { Input } from "@/components/ui/input";

import { useActionState } from "react";

import { verifyTwoFactorLoginAction } from "@/server/actions/auth";
import type { ActionResult } from "@/server/actions/types";

export function TwoFactorLoginForm() {
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(
    verifyTwoFactorLoginAction,
    undefined,
  );
  return (
    <form action={action} className="space-y-4">
      {state?.error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200" role="alert">
          {state.error}
        </div>
      ) : null}
      <div>
        <Label htmlFor="code">
          Authenticator code
        </Label>
        <Input
          id="code"
          name="code" className="text-center font-mono text-lg tracking-[0.3em]"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          placeholder="000000"
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <Checkbox name="recoveryCode" />
        Use a recovery code instead
      </label>
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <Checkbox name="trustDevice" />
        Trust this device for 30 days
      </label>
      <Button variant="default" type="submit" className="w-full" disabled={pending}>
        {pending ? "Checking…" : "Verify and sign in"}
      </Button>
    </form>
  );
}
