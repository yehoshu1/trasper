import type { ItinerarySnapshot } from "@/lib/documents";

import {
  DocumentFrame,
  FlightSummary,
  FlightsTable,
  NotesBlock,
  PartyBlock,
  SectionHeading,
  formatDocDate,
} from "./shared";

/** Travel itinerary. No fares, margin, bank details or validity. */
export function ItineraryDocument({ snapshot }: { snapshot: ItinerarySnapshot }) {
  return (
    <DocumentFrame
      company={snapshot.company}
      number={snapshot.number}
      title="Travel itinerary"
      template={snapshot.template}
      footerText={snapshot.company.footerText}
    >
      <PartyBlock
        contact={snapshot.contact}
        passengers={snapshot.passengers}
        referenceNo={snapshot.referenceNo}
        document={{
          title: "Travel itinerary",
          number: snapshot.number,
          meta: [
            { label: "Date", value: formatDocDate(snapshot.issueDate) },
            ...(snapshot.quotationNumber
              ? [{ label: "Quotation", value: snapshot.quotationNumber }]
              : []),
          ],
        }}
      />

      {snapshot.journeys && snapshot.journeys.length > 1 ? (
        snapshot.journeys.map((journey, index) => (
          <div key={`${journey.label}-${index}`} className="doc-section">
            <SectionHeading>{journey.label}</SectionHeading>
            {journey.pnr ? (
              <p className="mb-2 text-xs text-slate-600">Booking reference {journey.pnr}</p>
            ) : null}
            {journey.flights.length > 0 ? (
              <>
                <FlightSummary flights={journey.flights} />
                <FlightsTable flights={journey.flights} />
              </>
            ) : null}
          </div>
        ))
      ) : (
        <>
          <section className="doc-section">
            {snapshot.showOptionLabel !== false ? (
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <SectionHeading>{snapshot.optionLabel}</SectionHeading>
                {snapshot.pnr ? <p className="text-xs text-slate-600">Booking reference {snapshot.pnr}</p> : null}
              </div>
            ) : snapshot.pnr ? (
              <p className="mb-2 text-xs text-slate-600">Booking reference {snapshot.pnr}</p>
            ) : null}
            {snapshot.flights.length > 0 ? <FlightSummary flights={snapshot.flights} /> : null}
          </section>

          {snapshot.flights.length > 0 ? <FlightsTable flights={snapshot.flights} /> : null}
        </>
      )}

      <div className="doc-section">
        <NotesBlock title="Travel notes" notes={snapshot.notes} />
      </div>

      <section className="doc-section text-[11px] text-slate-500">
        <p>
          Itinerary {snapshot.number} · Issued {formatDocDate(snapshot.issueDate)}
          {snapshot.quotationNumber ? ` · Quotation ${snapshot.quotationNumber}` : ""}.
        </p>
        {snapshot.flights.length > 0 ? (
          <p className="mt-1">
            Flight times are shown in the local time at each airport. Please reconfirm your flights
            before travel; airlines may change schedules.
          </p>
        ) : null}
      </section>
    </DocumentFrame>
  );
}
