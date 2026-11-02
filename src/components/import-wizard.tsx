"use client";

import { Button } from "@/components/ui/button";

import { Label } from "@/components/ui/label";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { useState, useTransition } from "react";

import { Alert } from "@/components/ui";
import { Checkbox } from "@/components/ui/checkbox";
import {
  importContactsCsvAction,
  previewContactsCsvAction,
} from "@/server/actions/contacts";

interface PreviewRow {
  line: number;
  name: string;
  email: string;
  city: string;
  errors: string[];
  duplicate: boolean;
}

interface Preview {
  ok: boolean;
  error?: string;
  columns: string[];
  unknownHeaders: string[];
  rows: PreviewRow[];
  validCount: number;
}

export function ContactImportWizard() {
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [includeDuplicates, setIncludeDuplicates] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function loadPreview(text: string) {
    setCsv(text);
    setMessage(null);
    startTransition(async () => {
      const result = await previewContactsCsvAction(text);
      setPreview(result);
    });
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    loadPreview(text);
  }

  function handleImport() {
    if (!preview?.ok) return;
    startTransition(async () => {
      const result = await importContactsCsvAction(csv, includeDuplicates);
      if (result.ok) {
        setMessage({ tone: "success", text: result.message ?? "Import complete" });
        setPreview(null);
        setCsv("");
      } else {
        setMessage({ tone: "error", text: result.error ?? "Import failed" });
      }
    });
  }

  return (
    <div className="space-y-5">
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}

      <div className="card card-body space-y-4">
        <div>
          <Label htmlFor="csv-file">
            Choose a CSV file
          </Label>
          <Input
            id="csv-file"
            type="file"
            accept=".csv,text/csv" className="file:mr-3 file:rounded-md file:border file:border-border file:bg-secondary file:px-3 file:py-1 file:text-xs file:font-medium file:text-secondary-foreground hover:file:bg-accent"
            onChange={(event) => handleFile(event.target.files?.[0])}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            The first row must contain headers. A <strong>Name</strong> column is required; type,
            attention, P.O. Box, city, country, address, email, phone and notes are recognised.
          </p>
        </div>
        <div>
          <Label htmlFor="csv-text">
            …or paste CSV
          </Label>
          <Textarea
            id="csv-text" className="font-mono text-xs"
            rows={8}
            value={csv}
            onChange={(event) => setCsv(event.target.value)}
            placeholder={"Name,Type,Email,Phone,City\nAcme Group Ltd,Organisation,accounts@example.com,+44 20 7946 0100,London"}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary"
            type="button"
            disabled={pending || csv.trim() === ""}
            onClick={() => loadPreview(csv)}
          >
            {pending ? "Checking…" : "Preview import"}
          </Button>
          {preview ? (
            <span className="self-center text-xs text-muted-foreground">
              {preview.validCount} ready to import · {preview.rows.length} rows read
            </span>
          ) : null}
        </div>
      </div>

      {preview?.error ? <Alert tone="error">{preview.error}</Alert> : null}

      {preview?.unknownHeaders.length ? (
        <Alert tone="warning">
          Ignored columns: {preview.unknownHeaders.join(", ")}
        </Alert>
      ) : null}

      {preview?.ok && preview.rows.length > 0 ? (
        <div className="card">
          <div className="card-body space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Preview</h2>
                <p className="text-xs text-muted-foreground">
                  Nothing is written until you press Import. Duplicate names, emails or phone
                  numbers are highlighted.
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <Checkbox
                  checked={includeDuplicates}
                  onCheckedChange={(value) => setIncludeDuplicates(value === true)}
                />
                Import possible duplicates
              </label>
            </div>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Line</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>City</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => (
                    <tr key={row.line} className={row.errors.length > 0 ? "bg-red-50 dark:bg-red-500/10" : undefined}>
                      <td>{row.line}</td>
                      <td>{row.name || "—"}</td>
                      <td>{row.email || "—"}</td>
                      <td>{row.city || "—"}</td>
                      <td className="text-xs">
                        {row.errors.length > 0 ? (
                          <span className="text-red-700 dark:text-red-300">{row.errors.join("; ")}</span>
                        ) : row.duplicate ? (
                          <span className="text-amber-700 dark:text-amber-300">Possible duplicate</span>
                        ) : (
                          <span className="text-emerald-700 dark:text-emerald-300">Ready</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button variant="default"
              type="button"
              disabled={pending || preview.validCount === 0}
              onClick={handleImport}
            >
              {pending ? "Importing…" : `Import ${preview.validCount} customer${preview.validCount === 1 ? "" : "s"}`}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
