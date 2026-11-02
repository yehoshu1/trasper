import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import { ConfirmButton } from "@/components/confirm-button";
import { Card, EmptyState } from "@/components/ui";
import { formatDateTime } from "@/lib/dates";
import { prisma } from "@/server/db";
import { archiveAttachmentAction, uploadAttachmentAction } from "@/server/actions/attachments";

/** Supplier confirmations, tickets and notes attached to a document. */
export async function AttachmentPanel({
  quotationId,
  proformaId,
  canManage,
}: {
  quotationId?: string;
  proformaId?: string;
  canManage: boolean;
}) {
  const attachments = await prisma.attachment.findMany({
    where: {
      ...(quotationId ? { quotationId } : {}),
      ...(proformaId ? { proformaId } : {}),
      archivedAt: null,
    },
    include: { uploadedBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <Card
      title={`Attachments (${attachments.length})`}
      subtitle="Supplier confirmations, tickets and notes. Files live on the persistent volume; archived files are kept, never deleted."
    >
      {attachments.length === 0 ? (
        <EmptyState title="No attachments" />
      ) : (
        <ul className="divide-y divide-border">
          {attachments.map((attachment) => (
            <li key={attachment.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <a
                  href={`/api/attachments/${attachment.id}`}
                  className="block truncate text-sm font-semibold text-foreground"
                >
                  {attachment.originalName}
                </a>
                <p className="text-xs text-muted-foreground">
                  {Math.max(1, Math.round(attachment.sizeBytes / 1024))} KB · {attachment.mimeType} ·{" "}
                  {attachment.uploadedBy.name} · {formatDateTime(attachment.createdAt)}
                </p>
              </div>
              {canManage ? (
                <form action={archiveAttachmentAction}>
                  <Input type="hidden" name="id" value={attachment.id} />
                  <ConfirmButton variant="ghost" className="px-2 py-1 text-xs" message="Archive this attachment? The file stays on disk.">
                    Archive
                  </ConfirmButton>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        <form action={uploadAttachmentAction} className="mt-4 grid gap-2 border-t border-border/70 pt-4 sm:grid-cols-[1fr_auto]">
          {quotationId ? <Input type="hidden" name="quotationId" value={quotationId} /> : null}
          {proformaId ? <Input type="hidden" name="proformaId" value={proformaId} /> : null}
          <Input
            type="file"
            name="file"
            required className="py-1.5 text-xs"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.eml,.doc,.docx,.xls,.xlsx,.zip"
          />
          <Button variant="secondary" type="submit">Upload</Button>
          <p className="text-[11px] text-muted-foreground sm:col-span-2">
            PDF, images, text, email, Office files or zip · maximum 10 MB. Downloads re-check your role.
          </p>
        </form>
      ) : null}
    </Card>
  );
}
