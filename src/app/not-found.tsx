import Link from "next/link";

import { ErrorState } from "@/components/error-state";

export default function NotFound() {
  return (
    <ErrorState
      fullHeight
      code="404"
      title="This page does not exist"
      description="The address may be mistyped, or the page may have moved. Check the link, or return to the workspace."
      actions={
        <>
          <Link href="/" className="btn-primary">
            Back to home
          </Link>
          <Link href="/login" className="btn-secondary">
            Staff sign in
          </Link>
        </>
      }
    />
  );
}
