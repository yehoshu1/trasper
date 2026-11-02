import Link from "next/link";
import { notFound } from "next/navigation";

import { Alert, PageHeader } from "@/components/ui";
import { ContactForm } from "@/components/contact-form";
import { updateContactAction } from "@/server/actions/contacts";
import { requireCapableUser } from "@/server/auth";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function EditCustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireCapableUser("manageContacts");
  const { id } = await params;
  const { error } = await searchParams;
  const contact = await prisma.contact.findUnique({ where: { id } });
  if (!contact) notFound();

  return (
    <div className="max-w-4xl">
      <PageHeader
        eyebrow="Customers"
        title={`Edit ${contact.name}`}
        actions={<Link href={`/customers/${contact.id}`} className="btn-secondary">Back to customer</Link>}
      />
      {error ? <Alert tone="error">{error}</Alert> : null}
      <ContactForm
        action={updateContactAction}
        contactId={contact.id}
        version={contact.version}
        submitLabel="Save changes"
        cancelHref={`/customers/${contact.id}`}
        values={{
          name: contact.name,
          type: contact.type,
          attention: contact.attention ?? "",
          poBox: contact.poBox ?? "",
          city: contact.city ?? "",
          country: contact.country ?? "",
          physicalAddress: contact.physicalAddress ?? "",
          email: contact.email ?? "",
          phone: contact.phone ?? "",
          notes: contact.notes ?? "",
        }}
      />
    </div>
  );
}
