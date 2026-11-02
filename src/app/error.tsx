"use client";

import Link from "next/link";
import { useEffect } from "react";

import { ErrorState, errorReference } from "@/components/error-state";

export default function Error({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Application error", error);
  }, [error]);

  return (
    <ErrorState
      fullHeight
      code="500"
      title="Something went wrong"
      description="The page could not be loaded. Try again; if the problem continues, check the server logs or contact your administrator."
      reference={errorReference(error)}
      actions={
        <>
          <button type="button" className="btn-primary" onClick={() => retry()}>
            Try again
          </button>
          <Link href="/" className="btn-secondary">
            Back to home
          </Link>
        </>
      }
    />
  );
}
