import Link from "next/link";

import { ErrorState } from "@/components/error-state";

export default function DocsNotFound() {
  return (
    <ErrorState
      code="404"
      title="Documentation page not found"
      description="That guide page does not exist. Return to the documentation home, or open the staff workspace."
      actions={
        <>
          <Link href="/docs" className="btn-primary">
            Documentation home
          </Link>
          <Link href="/dashboard" className="btn-secondary">
            Open the app
          </Link>
        </>
      }
    />
  );
}
