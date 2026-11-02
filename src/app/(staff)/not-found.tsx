import Link from "next/link";

import { ErrorState } from "@/components/error-state";

export default function StaffNotFound() {
  return (
    <ErrorState
      code="404"
      title="Record not found"
      description="This page or record does not exist, or it may have been archived. Check the link, or return to your workspace."
      actions={
        <>
          <Link href="/dashboard" className="btn-primary">
            Go to dashboard
          </Link>
          <Link href="/quotations" className="btn-secondary">
            Quotations
          </Link>
        </>
      }
    />
  );
}
