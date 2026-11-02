import Link from "next/link";

import { ContactImportWizard } from "@/components/import-wizard";
import { PageHeader } from "@/components/ui";
import { requireCapableUser } from "@/server/auth";

export const dynamic = "force-dynamic";

export default async function ImportCustomersPage() {
  await requireCapableUser("manageContacts");

  return (
    <div className="max-w-5xl">
      <PageHeader
        eyebrow="Customers"
        title="Import customers from CSV"
        subtitle="Preview first, then import. Rows with errors are skipped; possible duplicates are flagged."
        actions={<Link href="/customers" className="btn-secondary">Back to customers</Link>}
      />
      <ContactImportWizard />
    </div>
  );
}
