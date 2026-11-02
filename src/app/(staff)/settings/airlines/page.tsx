import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import { Alert, Card, Field, PageHeader } from "@/components/ui";
import { LogoUploadForm } from "@/components/logo-upload";
import { requireCapableUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { upsertAirlineAction } from "@/server/actions/settings";

export const dynamic = "force-dynamic";

export default async function AirlinesSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string; q?: string }>;
}) {
  await requireCapableUser("manageSettings");
  const query = await searchParams;
  const term = (query.q ?? "").trim();

  const airlines = await prisma.airline.findMany({
    where: term
      ? { OR: [{ iata: { contains: term.toUpperCase() } }, { name: { contains: term } }] }
      : {},
    orderBy: { iata: "asc" },
    take: 300,
  });

  return (
    <div className="max-w-5xl">
      <PageHeader
        eyebrow="Settings"
        title="Airlines and logos"
        subtitle="Logos are copied into each document when it is issued, so later replacements never change an issued document."
      />

      {query.error ? <Alert tone="error">{query.error}</Alert> : null}
      {query.saved ? <Alert tone="success">Saved.</Alert> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card title={`Airlines (${airlines.length})`}>
          <form className="mb-3 flex flex-wrap gap-2" method="get">
            <Input
              type="search"
              name="q"
              defaultValue={term}
              placeholder="Search code or name" className="max-w-xs"
              aria-label="Search airlines"
            />
            <Button variant="secondary" type="submit">
              Search
            </Button>
          </form>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Logo</th>
                  <th>Replace logo</th>
                </tr>
              </thead>
              <tbody>
                {airlines.map((airline) => (
                  <tr key={airline.iata}>
                    <td className="font-semibold text-foreground">{airline.iata}</td>
                    <td className="text-foreground">{airline.name}</td>
                    <td>
                      {airline.logoPath ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={airline.logoPath} alt={airline.name} className="h-10 w-20 object-contain" />
                      ) : (
                        <span className="text-xs text-muted-foreground/70">None</span>
                      )}
                    </td>
                    <td>
                      <LogoUploadForm airline={airline.iata} label="Upload" />
                    </td>
                  </tr>
                ))}
                {airlines.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-sm text-muted-foreground">
                      No airlines match. Add one on the right.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="space-y-6">
          <Card title="Add or rename an airline">
            <form action={upsertAirlineAction} className="space-y-3">
              <Field label="IATA code" htmlFor="iata" hint="Two or three letters, e.g. ET">
                <Input id="iata" name="iata" className="uppercase" maxLength={3} required />
              </Field>
              <Field label="Airline name" htmlFor="name">
                <Input id="name" name="name" required maxLength={120} />
              </Field>
              <Button variant="default" type="submit" className="w-full">
                Save airline
              </Button>
            </form>
          </Card>
          <Card title="Company logo">
            <p className="mb-3 text-xs text-muted-foreground">
              The company header image appears in the top-left of every document.
            </p>
            <LogoUploadForm label="Upload header image" />
          </Card>
        </div>
      </div>
    </div>
  );
}
