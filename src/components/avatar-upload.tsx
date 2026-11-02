"use client";

import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import { useState } from "react";

export function AvatarUploadForm({ label = "Upload photo" }: { label?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(formData: FormData) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/upload/avatar", { method: "POST", body: formData });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Upload failed");
        return;
      }
      window.location.reload();
    } catch {
      setError("Upload failed. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void upload(new FormData(event.currentTarget));
      }}
    >
      <Input
        type="file"
        name="file"
        accept="image/png,image/jpeg,image/webp"
        required
        className="block max-w-[220px] text-xs text-muted-foreground file:mr-2 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1.5 file:text-xs file:font-semibold"
      />
      <Button variant="secondary" type="submit" className="px-2.5 py-1.5 text-xs" disabled={pending}>
        {pending ? "Uploading…" : label}
      </Button>
      {error ? <span className="text-xs text-red-600 dark:text-red-400">{error}</span> : null}
    </form>
  );
}
