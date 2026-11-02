"use client";

import { Button } from "@/components/ui/button";

import { Label } from "@/components/ui/label";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { useState, useTransition, type FormEvent } from "react";
import { Check, ClipboardCopy, Sparkles } from "lucide-react";

import { convertPnrAction } from "@/server/actions/pnr";
import type { PnrConvertResult } from "@/lib/schemas";

const EXAMPLE = `ET873 | 31 Oct 2026 | LLW - LUN | 06:20 - 09:10
ET874 | 07 Nov 2026 | LUN - LLW | 10:15 - 12:05
PAX: MORGAN/ALEX MR, MORGAN/SAM MS`;

export function PnrConverter() {
  const [text, setText] = useState("");
  const [referenceYear, setReferenceYear] = useState(String(new Date().getFullYear()));
  const [result, setResult] = useState<PnrConvertResult | null>(null);
  const [method, setMethod] = useState<"rules" | "ai" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setCopied(false);
    startTransition(async () => {
      const response = await convertPnrAction({
        text,
        referenceYear: Number(referenceYear),
      });
      if (!response.ok || !response.result) {
        setResult(null);
        setMethod(null);
        setError(response.error ?? "The text could not be converted");
        return;
      }
      setResult(response.result);
      setMethod(response.method ?? "rules");
    });
  }

  async function copyPnr() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.pnrText);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <Label htmlFor="pnr-input">
            PNR or itinerary text
          </Label>
          <Textarea
            id="pnr-input" className="min-h-48 font-mono text-[12px] leading-relaxed"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={EXAMPLE}
            required
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            Paste booking-system output or one segment per line in itinerary form. Flight, date,
            two airport codes and two times are required; passenger lines are optional.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="w-36">
            <Label htmlFor="pnr-year">
              Reference year
            </Label>
            <Input
              id="pnr-year"
              type="number"
              min={2000}
              max={2100}
              value={referenceYear}
              onChange={(event) => setReferenceYear(event.target.value)}
            />
          </div>
          <Button variant="default" type="submit" disabled={pending || text.trim() === ""}>
            <Sparkles className="h-4 w-4" />
            {pending ? "Converting…" : "Convert to PNR"}
          </Button>
        </div>
      </form>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200" role="alert">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-foreground">Normalised PNR</p>
              <p className="text-xs text-muted-foreground">
                {method === "ai"
                  ? "Converted with AI; verify every field."
                  : result.format === "itinerary"
                    ? "Converted from itinerary format."
                    : "Reformatted from booking-system output."}{" "}
                {result.segments.length} segment{result.segments.length === 1 ? "" : "s"}.
              </p>
            </div>
            <Button variant="secondary" type="button" onClick={() => void copyPnr()}>
              {copied ? <Check className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy PNR"}
            </Button>
          </div>
          <pre className="overflow-x-auto rounded-lg border border-border bg-muted/30 p-4 font-mono text-[12px] leading-relaxed text-foreground">
            {result.pnrText}
          </pre>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="table">
              <thead>
                <tr>
                  <th>Flight</th>
                  <th>Route</th>
                  <th>Departure</th>
                  <th>Arrival</th>
                </tr>
              </thead>
              <tbody>
                {result.segments.map((segment, index) => (
                  <tr key={`${segment.airline}-${segment.flightNo}-${index}`}>
                    <td className="font-medium">
                      {segment.airline} {segment.flightNo}
                      {segment.cabin ? <span className="ml-1 text-xs text-muted-foreground">{segment.cabin}</span> : null}
                    </td>
                    <td>
                      {segment.fromIata} → {segment.toIata}
                    </td>
                    <td className="tabular-nums">{segment.departLocal.replace("T", " ")}</td>
                    <td className="tabular-nums">{segment.arriveLocal.replace("T", " ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result.passengers.length > 0 ? (
            <div>
              <p className="section-label">Passengers</p>
              <p className="mt-1 text-sm text-foreground">
                {result.passengers
                  .map((passenger) =>
                    [passenger.firstName, passenger.lastName, passenger.title]
                      .filter(Boolean)
                      .join(" "),
                  )
                  .join(" · ")}
              </p>
            </div>
          ) : null}

          {result.warnings.length > 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
              <p className="font-semibold">Check before using</p>
              <ul className="mt-1 space-y-0.5">
                {result.warnings.map((warning, index) => (
                  <li key={index}>· {warning}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {result.unparsed.length > 0 ? (
            <div>
              <p className="section-label">Lines left unparsed</p>
              <ul className="mt-1 space-y-0.5 font-mono text-[11px] text-muted-foreground">
                {result.unparsed.map((line, index) => (
                  <li key={index}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
