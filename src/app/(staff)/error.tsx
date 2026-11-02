"use client";

import Link from "next/link";
import { useEffect } from "react";

import { ErrorState, errorReference } from "@/components/error-state";

export default function StaffError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Staff application error", error);
  }, [error]);

  return (
    <ErrorState
      code="500"
      title="This page could not be loaded"
      description="Try again. If the problem continues, check the server logs or contact your administrator."
      reference={errorReference(error)}
      actions={
        <>
          <button type="button" className="btn-primary" onClick={() => retry()}>
            Try again
          </button>
          <Link href="/dashboard" className="btn-secondary">
            Go to dashboard
          </Link>
        </>
      }
    />
  );
}
