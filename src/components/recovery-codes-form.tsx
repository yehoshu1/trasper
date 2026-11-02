"use client";

import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import { useState, useTransition } from "react";

import { Field } from "@/components/ui";
import { regenerateRecoveryCodesClientAction } from "@/server/actions/two-factor";

export function RecoveryCodesForm() {
  const [password, setPassword] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function generate() {
    setError(null);
    setCodes([]);
    startTransition(async () => {
      const result = await regenerateRecoveryCodesClientAction(password);
      if (!result.ok) {
        setError(result.error ?? "Could not generate recovery codes");
        return;
      }
      setCodes(result.codes ?? []);
      setPassword("");
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Password" htmlFor="regenPassword">
          <Input
            id="regenPassword"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />
        </Field>
        <Button variant="secondary" type="button" disabled={pending || password.length === 0} onClick={generate}>
          {pending ? "Generating…" : "Generate new recovery codes"}
        </Button>
      </div>
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      {codes.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="text-sm font-semibold">Store these now; they are shown once.</p>
          <div className="mt-2 grid grid-cols-2 gap-1 font-mono text-xs">
            {codes.map((code) => (
              <span key={code} className="rounded bg-white/60 px-2 py-1 dark:bg-black/20">{code}</span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
