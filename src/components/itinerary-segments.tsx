"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { DateTimePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { parseItineraryPnrAction } from "@/server/actions/itineraries";

interface SegmentRow {
  key: string;
  airline: string;
  flightNo: string;
  fromIata: string;
  toIata: string;
  departLocal: string;
  arriveLocal: string;
  cabin: string;
  operatingCarrier: string;
}

let rowCounter = 0;

function emptySegment(): SegmentRow {
  rowCounter += 1;
  return {
    key: `flight-${rowCounter}`,
    airline: "",
    flightNo: "",
    fromIata: "",
    toIata: "",
    departLocal: "",
    arriveLocal: "",
    cabin: "",
    operatingCarrier: "",
  };
}

function hasContent(segment: SegmentRow): boolean {
  return Boolean(
    segment.airline.trim() ||
      segment.flightNo.trim() ||
      segment.fromIata.trim() ||
      segment.toIata.trim() ||
      segment.departLocal ||
      segment.arriveLocal,
  );
}

/**
 * Flights entered by hand, for itineraries that have no booking text to read.
 * The rows are posted as JSON and validated again by the server schema.
 */
export function ItinerarySegmentFields() {
  const [segments, setSegments] = useState<SegmentRow[]>([emptySegment()]);
  const [pnrText, setPnrText] = useState("");
  const [notices, setNotices] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function update(index: number, patch: Partial<SegmentRow>) {
    setSegments((current) =>
      current.map((segment, segmentIndex) =>
        segmentIndex === index ? { ...segment, ...patch } : segment,
      ),
    );
  }

  function add() {
    setSegments((current) => [...current, emptySegment()]);
  }

  function remove(index: number) {
    setSegments((current) => current.filter((_, segmentIndex) => segmentIndex !== index));
  }

  function readPnr() {
    setError(null);
    setNotices([]);
    startTransition(async () => {
      const response = await parseItineraryPnrAction(pnrText, new Date().getUTCFullYear());
      if (!response.ok || !response.result) {
        setError(response.error ?? "Could not read that PNR or itinerary");
        return;
      }
      const parsed = response.result;
      if (response.pnrText) setPnrText(response.pnrText);
      const parsedRows = parsed.segments.map((segment) => ({
        key: emptySegment().key,
        airline: segment.airline,
        flightNo: segment.flightNo,
        fromIata: segment.fromIata,
        toIata: segment.toIata,
        departLocal: segment.departLocal,
        arriveLocal: segment.arriveLocal,
        cabin: segment.cabin ?? "",
        operatingCarrier: segment.operatingCarrier ?? "",
      }));
      setSegments(parsedRows.length > 0 ? parsedRows : [emptySegment()]);

      const next: string[] = [];
      if (response.format === "itinerary") next.push("Converted itinerary to PNR format.");
      if (parsed.segments.some((segment) => segment.flightNo === "XXX")) {
        next.push("XXX flight numbers are placeholders; replace them before creating the itinerary.");
      }
      if (parsed.passengers.length > 0) {
        next.push(
          `${parsed.passengers.length} passenger name(s) read: ${parsed.passengers
            .map((passenger) => `${passenger.firstName} ${passenger.lastName}`)
            .join(", ")}. Select them in the passenger list below.`,
        );
      } else {
        next.push("No passenger names were found. Select passengers below or leave them to be advised.");
      }
      next.push(...parsed.warnings);
      if (parsed.unparsed.length > 0) {
        next.push(`Could not read ${parsed.unparsed.length} line(s); add them by hand.`);
      }
      next.push(
        `${parsed.segments.length} segment${parsed.segments.length === 1 ? "" : "s"} read and applied to the flight rows.`,
      );
      setNotices(next);
    });
  }

  const payload = segments.filter(hasContent).map(({ key: _key, ...segment }) => segment);

  return (
    <div>
      <input type="hidden" name="segments" value={JSON.stringify(payload)} readOnly />
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Flights (optional)
        </p>
        <Button variant="ghost" type="button" className="px-2 py-1 text-xs" onClick={add}>
          + Add flight
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="table min-w-[1080px]">
          <thead>
            <tr>
              <th>Airline</th>
              <th>Flight</th>
              <th>From</th>
              <th>To</th>
              <th>Departs (local)</th>
              <th>Arrives (local)</th>
              <th>Cabin</th>
              <th>Operated by</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {segments.map((segment, index) => (
              <tr key={segment.key}>
                <td>
                  <Input
                    className="w-16 px-1 py-1"
                    value={segment.airline}
                    onChange={(event) => update(index, { airline: event.target.value.toUpperCase() })}
                  />
                </td>
                <td>
                  <Input
                    className="w-20 px-1 py-1"
                    value={segment.flightNo}
                    onChange={(event) => update(index, { flightNo: event.target.value.toUpperCase() })}
                  />
                </td>
                <td>
                  <Input
                    className="w-16 px-1 py-1"
                    value={segment.fromIata}
                    onChange={(event) => update(index, { fromIata: event.target.value.toUpperCase() })}
                  />
                </td>
                <td>
                  <Input
                    className="w-16 px-1 py-1"
                    value={segment.toIata}
                    onChange={(event) => update(index, { toIata: event.target.value.toUpperCase() })}
                  />
                </td>
                <td>
                  <DateTimePicker
                    className="w-44 px-1 py-1"
                    value={segment.departLocal}
                    onValueChange={(value) => update(index, { departLocal: value })}
                  />
                </td>
                <td>
                  <DateTimePicker
                    className="w-44 px-1 py-1"
                    value={segment.arriveLocal}
                    onValueChange={(value) => update(index, { arriveLocal: value })}
                  />
                </td>
                <td>
                  <Input
                    className="w-20 px-1 py-1"
                    value={segment.cabin}
                    onChange={(event) => update(index, { cabin: event.target.value })}
                  />
                </td>
                <td>
                  <Input
                    className="w-40 px-1 py-1"
                    value={segment.operatingCarrier}
                    placeholder="Same carrier"
                    onChange={(event) => update(index, { operatingCarrier: event.target.value })}
                  />
                </td>
                <td>
                  {segments.length > 1 ? (
                    <button
                      type="button"
                      className="text-xs font-semibold text-red-600 dark:text-red-400"
                      onClick={() => remove(index)}
                    >
                      Remove
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3">
        <p className="text-xs font-semibold text-foreground">Import a PNR or itinerary</p>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="flex-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            PNR or itinerary text
            <Textarea
              name="pnrText"
              rows={5}
              className="mt-1 font-mono text-xs"
              placeholder="Paste booking-system output or one segment per line in itinerary form"
              value={pnrText}
              onChange={(event) => setPnrText(event.target.value)}
            />
          </label>
          <Button
            variant="secondary"
            type="button"
            disabled={pending || pnrText.trim() === ""}
            onClick={readPnr}
          >
            {pending ? "Reading…" : "Read / convert"}
          </Button>
        </div>
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          Paste booking-system output or one segment per line. Itinerary lines become a clean PNR
          before the flights are applied. Nothing is created until you submit the form.
        </p>
        {error ? (
          <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </p>
        ) : null}
        {notices.length > 0 ? (
          <ul className="mt-2 space-y-0.5 text-xs text-foreground">
            {notices.map((notice, index) => (
              <li key={index}>· {notice}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
