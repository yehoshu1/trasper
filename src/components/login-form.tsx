"use client";

import { Button } from "@/components/ui/button";

import { Label } from "@/components/ui/label";

import { Input } from "@/components/ui/input";

import { useActionState } from "react";

import { signInAction } from "@/server/actions/auth";
import type { ActionResult } from "@/server/actions/types";

export function LoginForm() {
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(
    signInAction,
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
        <Label htmlFor="email">
          Email address
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          placeholder="you@example.com"
        />
      </div>
      <div>
        <Label htmlFor="password">
          Password
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      <Button variant="default" type="submit" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        <a href="/login/forgot" className="font-semibold underline">Forgot your password?</a>
      </p>
      <p className="text-center text-xs text-muted-foreground">
        Staff access only. Repeated failed attempts lock the account for 15 minutes.
      </p>
    </form>
  );
}
