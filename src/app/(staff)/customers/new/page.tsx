import Link from "next/link";

import { Alert, PageHeader } from "@/components/ui";
import { ContactForm } from "@/components/contact-form";
import { createContactAction } from "@/server/actions/contacts";
import { requireCapableUser } from "@/server/auth";

export const dynamic = "force-dynamic";

export default async function NewCustomerPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireCapableUser("manageContacts");
  const params = await searchParams;

  return (
    <div className="max-w-4xl">
      <PageHeader
        eyebrow="Customers"
        title="New customer"
        subtitle="The paying customer. Passengers are added separately and can be linked to several customers."
        actions={<Link href="/customers" className="btn-secondary">Back to customers</Link>}
      />
      {params.error ? <Alert tone="error">{params.error}</Alert> : null}
      <ContactForm action={createContactAction} submitLabel="Create customer" />
    </div>
  );
}
