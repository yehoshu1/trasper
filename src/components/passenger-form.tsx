import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import { Field } from "@/components/ui";
import { SelectField } from "@/components/ui/select";

export interface PassengerFormValues {
  title?: string;
  firstName?: string;
  lastName?: string;
  type?: string;
}

export function PassengerForm({
  action,
  values = {},
  contactId,
  passengerId,
  submitLabel = "Save passenger",
  cancelHref = "/passengers",
  compact = false,
  version,
}: {
  action: (formData: FormData) => void | Promise<void>;
  values?: PassengerFormValues;
  contactId?: string;
  passengerId?: string;
  submitLabel?: string;
  cancelHref?: string;
  compact?: boolean;
  /** Optimistic-locking token loaded with the record. */
  version?: number;
}) {
  return (
    <form action={action} className={compact ? "grid gap-3 sm:grid-cols-2" : "space-y-4"}>
      {contactId ? <Input type="hidden" name="contactId" value={contactId} /> : null}
      {passengerId ? <Input type="hidden" name="id" value={passengerId} /> : null}
      {version ? <Input type="hidden" name="version" value={version} /> : null}
      <Field label="Title" htmlFor={`title-${passengerId ?? contactId ?? "new"}`}>
        <SelectField
          id={`title-${passengerId ?? contactId ?? "new"}`}
          name="title"
          defaultValue={values.title ?? ""}
          placeholder="—"
          options={[
            { value: "", label: "—" },
            { value: "Mr", label: "Mr" },
            { value: "Mrs", label: "Mrs" },
            { value: "Ms", label: "Ms" },
            { value: "Miss", label: "Miss" },
            { value: "Dr", label: "Dr" },
            { value: "Prof", label: "Prof" },
            { value: "Mstr", label: "Mstr" },
          ]}
        />
      </Field>
      <Field label="Passenger type" htmlFor={`type-${passengerId ?? contactId ?? "new"}`}>
        <SelectField
          id={`type-${passengerId ?? contactId ?? "new"}`}
          name="type"
          defaultValue={values.type ?? "adult"}
          options={[
            { value: "adult", label: "Adult" },
            { value: "child", label: "Child" },
            { value: "infant", label: "Infant" },
          ]}
        />
      </Field>
      <Field label="First name" htmlFor={`firstName-${passengerId ?? contactId ?? "new"}`}>
        <Input
          id={`firstName-${passengerId ?? contactId ?? "new"}`}
          name="firstName"
          required
          defaultValue={values.firstName}
          autoComplete="off"
        />
      </Field>
      <Field label="Last name" htmlFor={`lastName-${passengerId ?? contactId ?? "new"}`}>
        <Input
          id={`lastName-${passengerId ?? contactId ?? "new"}`}
          name="lastName"
          required
          defaultValue={values.lastName}
          autoComplete="off"
        />
      </Field>
      <div className={`flex items-center gap-2 ${compact ? "sm:col-span-2" : ""}`}>
        <Button variant="default" type="submit">
          {submitLabel}
        </Button>
        <a href={cancelHref} className="btn-secondary">
          Cancel
        </a>
      </div>
    </form>
  );
}
