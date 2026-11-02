import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { Field } from "@/components/ui";
import { SelectField } from "@/components/ui/select";

export interface ContactFormValues {
  name?: string;
  type?: string;
  attention?: string;
  poBox?: string;
  city?: string;
  country?: string;
  physicalAddress?: string;
  email?: string;
  phone?: string;
  notes?: string;
}

export function ContactForm({
  action,
  values = {},
  submitLabel = "Save customer",
  cancelHref = "/customers",
  contactId,
  version,
}: {
  action: (formData: FormData) => void | Promise<void>;
  values?: ContactFormValues;
  submitLabel?: string;
  cancelHref?: string;
  contactId?: string;
  /** Optimistic-locking token loaded with the record. */
  version?: number;
}) {
  return (
    <form action={action} className="space-y-6">
      {contactId ? <Input type="hidden" name="id" value={contactId} /> : null}
      {version ? <Input type="hidden" name="version" value={version} /> : null}
      <div className="card">
        <div className="card-body grid gap-5 md:grid-cols-2">
          <Field label="Name" htmlFor="name" hint="Organisation or paying customer" className="md:col-span-2">
            <Input id="name" name="name" required defaultValue={values.name} />
          </Field>
          <Field label="Type" htmlFor="type">
            <SelectField
              id="type"
              name="type"
              defaultValue={values.type ?? "organisation"}
              options={[
                { value: "organisation", label: "Organisation" },
                { value: "individual", label: "Individual" },
              ]}
            />
          </Field>
          <Field label="Attention" htmlFor="attention" hint="Person or department to address">
            <Input id="attention" name="attention" defaultValue={values.attention} />
          </Field>
          <Field label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" defaultValue={values.email} />
          </Field>
          <Field label="Phone" htmlFor="phone">
            <Input id="phone" name="phone" defaultValue={values.phone} />
          </Field>
          <Field label="P.O. Box" htmlFor="poBox">
            <Input id="poBox" name="poBox" defaultValue={values.poBox} />
          </Field>
          <Field label="City" htmlFor="city">
            <Input id="city" name="city" defaultValue={values.city} />
          </Field>
          <Field label="Country" htmlFor="country">
            <Input id="country" name="country" defaultValue={values.country} />
          </Field>
          <Field label="Physical address" htmlFor="physicalAddress" className="md:col-span-2">
            <Input id="physicalAddress" name="physicalAddress" defaultValue={values.physicalAddress} />
          </Field>
          <Field label="Notes" htmlFor="notes" className="md:col-span-2" hint="Internal notes only; not printed on documents">
            <Textarea id="notes" name="notes" rows={3} defaultValue={values.notes} />
          </Field>
        </div>
      </div>
      <div className="flex items-center gap-2">
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
