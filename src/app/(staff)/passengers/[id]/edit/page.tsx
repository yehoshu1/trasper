import Link from "next/link";
import { notFound } from "next/navigation";

import { PassengerForm } from "@/components/passenger-form";
import { Alert, PageHeader } from "@/components/ui";
import { requireCapableUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { updatePassengerAction } from "@/server/actions/contacts";

export const dynamic = "force-dynamic";

export default async function EditPassengerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireCapableUser("manageContacts");
  const { id } = await params;
  const { error } = await searchParams;
  const passenger = await prisma.passenger.findUnique({ where: { id } });
  if (!passenger) notFound();

  return (
    <div className="max-w-2xl">
      <PageHeader
        eyebrow="Passenger"
        title={`Edit ${passenger.firstName} ${passenger.lastName}`}
        actions={<Link href={`/passengers/${passenger.id}`} className="btn-secondary">Back to passenger</Link>}
      />
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="card card-body">
        <PassengerForm
          action={updatePassengerAction}
          passengerId={passenger.id}
          version={passenger.version}
          submitLabel="Save changes"
          cancelHref={`/passengers/${passenger.id}`}
          values={{
            title: passenger.title ?? "",
            firstName: passenger.firstName,
            lastName: passenger.lastName,
            type: passenger.type,
          }}
        />
      </div>
    </div>
  );
}
