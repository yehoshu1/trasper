"use client";

import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Field } from "@/components/ui";
import {
  confirmTwoFactorSetupAction,
  startTwoFactorSetupAction,
} from "@/server/actions/two-factor";

interface SetupData {
  totpURI: string;
  backupCodes: string[];
  qrDataUrl: string;
}

export function TwoFactorSetup() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [setup, setSetup] = useState<SetupData | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function begin() {
    setError(null);
    startTransition(async () => {
      const result = await startTwoFactorSetupAction(password);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSetup({ totpURI: result.totpURI, backupCodes: result.backupCodes, qrDataUrl: result.qrDataUrl });
    });
  }

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await confirmTwoFactorSetupAction(code);
      if (!result.ok) {
        setError(result.error ?? "Could not verify the code");
        return;
      }
      setDone(true);
      router.refresh();
    });
  }

  if (done) {
    return (
      <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
        Two-factor authentication is enabled. Keep your recovery codes somewhere safe.
      </p>
    );
  }

  if (!setup) {
    return (
      <div className="space-y-3">
        {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        <Field label="Confirm your password" htmlFor="twoFactorPassword" hint="Required to start enrolment">
          <Input
            id="twoFactorPassword"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />
        </Field>
        <Button variant="default" type="button" disabled={pending || password.length === 0} onClick={begin}>
          {pending ? "Starting…" : "Set up authenticator"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[240px_1fr]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={setup.qrDataUrl} alt="TOTP QR code" className="h-60 w-60 rounded-lg border bg-white p-2" />
        <div className="space-y-2 text-sm">
          <p className="font-semibold">1. Scan this code with your authenticator</p>
          <p className="text-xs text-muted-foreground">
            Or enter the URI manually:
          </p>
          <code className="block break-all rounded-md bg-muted p-2 text-[11px]">{setup.totpURI}</code>
          <p className="font-semibold">2. Save your recovery codes</p>
          <div className="grid grid-cols-2 gap-1 font-mono text-xs">
            {setup.backupCodes.map((backup) => (
              <span key={backup} className="rounded bg-muted px-2 py-1">{backup}</span>
            ))}
          </div>
        </div>
      </div>
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      <Field label="3. Enter the six-digit code" htmlFor="twoFactorCode">
        <Input
          id="twoFactorCode" className="max-w-[180px] text-center font-mono text-lg tracking-[0.3em]"
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
        />
      </Field>
      <Button variant="default" type="button" disabled={pending || code.length !== 6} onClick={confirm}>
        {pending ? "Verifying…" : "Verify and enable"}
      </Button>
    </div>
  );
}
