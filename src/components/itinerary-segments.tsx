"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { DateTimePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";

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
    </div>
  );
}
