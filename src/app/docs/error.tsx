"use client";

import Link from "next/link";
import { useEffect } from "react";

import { ErrorState, errorReference } from "@/components/error-state";

export default function DocsError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Documentation error", error);
  }, [error]);

  return (
    <ErrorState
      code="500"
      title="The documentation could not be loaded"
      description="Try again, or return to the documentation home. If the problem continues, check the server logs."
      reference={errorReference(error)}
      actions={
        <>
          <button type="button" className="btn-primary" onClick={() => retry()}>
            Try again
          </button>
          <Link href="/docs" className="btn-secondary">
            Documentation home
          </Link>
        </>
      }
    />
  );
}
