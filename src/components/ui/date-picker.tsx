"use client";

import * as React from "react";
import { format } from "date-fns";
import { CalendarDays, CalendarClock } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

function parseDate(value?: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? "");
  if (!match) return undefined;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function toDateValue(date: Date | undefined): string {
  return date ? format(date, "yyyy-MM-dd") : "";
}

function parseDateTime(value?: string): { date?: Date; time: string } {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(value ?? "");
  if (!match) return { time: "" };
  return { date: parseDate(match[1]), time: match[2] };
}

function bounds(min?: string, max?: string) {
  const matchers: Array<{ before: Date } | { after: Date }> = [];
  const minDate = parseDate(min);
  const maxDate = parseDate(max);
  if (minDate) matchers.push({ before: minDate });
  if (maxDate) matchers.push({ after: maxDate });
  return matchers.length > 0 ? matchers : undefined;
}

interface BasePickerProps {
  id?: string;
  name?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  min?: string;
  max?: string;
  className?: string;
  contentClassName?: string;
  "aria-label"?: string;
}

export interface DatePickerProps extends BasePickerProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}

/**
 * shadcn-style date picker. Keeps the form value as an ISO `yyyy-MM-dd` string
 * in a hidden input so server actions receive exactly what a native date
 * input sent before, while a visually hidden native date input preserves
 * browser constraint validation for required fields.
 */
export function DatePicker({
  id,
  name,
  value,
  defaultValue,
  onValueChange,
  placeholder = "Pick a date",
  required,
  disabled,
  min,
  max,
  className,
  contentClassName,
  "aria-label": ariaLabel,
}: DatePickerProps) {
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = React.useState(defaultValue ?? "");
  const [open, setOpen] = React.useState(false);
  const selectedValue = isControlled ? value : internalValue;
  const selected = parseDate(selectedValue);

  function commit(next: string) {
    if (!isControlled) setInternalValue(next);
    onValueChange?.(next);
  }

  function selectDate(date: Date | undefined) {
    commit(toDateValue(date));
    setOpen(false);
  }

  return (
    <div className="relative">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-label={ariaLabel}
            aria-required={required || undefined}
            className={cn(
              "w-full justify-start px-3 text-left font-normal",
              !selected && "text-muted-foreground",
              className,
            )}
          >
            <CalendarDays className="h-4 w-4 shrink-0 opacity-60" />
            <span className="truncate">
              {selected ? format(selected, "dd MMM yyyy") : placeholder}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className={cn("w-auto p-0", contentClassName)}>
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected}
            disabled={bounds(min, max)}
            onSelect={selectDate}
            autoFocus
          />
          <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => selectDate(new Date())}
            >
              Today
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={!selected || required}
              onClick={() => selectDate(undefined)}
            >
              Clear
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      {name ? <input type="hidden" name={name} value={selectedValue} disabled={disabled} /> : null}
      {required ? (
        <input
          type="date"
          required
          tabIndex={-1}
          aria-hidden
          value={selectedValue}
          onChange={() => undefined}
          className="sr-only"
        />
      ) : null}
    </div>
  );
}

export interface DateTimePickerProps extends BasePickerProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}

/**
 * Date and time picker built from the same shadcn calendar primitives.
 * Values keep the native `datetime-local` shape (`yyyy-MM-ddTHH:mm`).
 */
export function DateTimePicker({
  id,
  name,
  value,
  defaultValue,
  onValueChange,
  placeholder = "Pick a date and time",
  required,
  disabled,
  min,
  max,
  className,
  contentClassName,
  "aria-label": ariaLabel,
}: DateTimePickerProps) {
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = React.useState(defaultValue ?? "");
  const [open, setOpen] = React.useState(false);
  const selectedValue = isControlled ? value : internalValue;
  const parsed = parseDateTime(selectedValue);
  const selectedDate = parsed.date;
  const selectedTime = parsed.time;
  const display =
    selectedDate && selectedTime
      ? `${format(selectedDate, "dd MMM yyyy")}, ${selectedTime}`
      : selectedDate
        ? `${format(selectedDate, "dd MMM yyyy")}, --:--`
        : placeholder;

  function commit(date: Date | undefined, time: string) {
    const next = date ? `${format(date, "yyyy-MM-dd")}T${time || "00:00"}` : "";
    if (!isControlled) setInternalValue(next);
    onValueChange?.(next);
    return next;
  }

  function changeDate(date: Date | undefined) {
    commit(date, selectedTime);
  }

  function changeTime(time: string) {
    if (!selectedDate) return;
    commit(selectedDate, time);
  }

  return (
    <div className="relative">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-label={ariaLabel}
            aria-required={required || undefined}
            className={cn(
              "w-full justify-start px-3 text-left font-normal",
              !selectedDate && "text-muted-foreground",
              className,
            )}
          >
            <CalendarClock className="h-4 w-4 shrink-0 opacity-60" />
            <span className="truncate">{display}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className={cn("w-auto p-0", contentClassName)}>
          <Calendar
            mode="single"
            selected={selectedDate}
            defaultMonth={selectedDate}
            disabled={bounds(min, max)}
            onSelect={changeDate}
            autoFocus
          />
          <div className="flex items-end gap-2 border-t px-3 py-3">
            <Label className="grid flex-1 gap-1.5 text-[11px] font-medium text-muted-foreground">
              Time (24-hour)
              <Input
                type="time"
                value={selectedTime}
                disabled={!selectedDate || disabled}
                onChange={(event) => changeTime(event.target.value)}
                className="h-8"
              />
            </Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                commit(undefined, "");
                setOpen(false);
              }}
              disabled={!selectedDate}
            >
              Clear
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={!selectedDate || !selectedTime}
            >
              Done
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      {name ? <input type="hidden" name={name} value={selectedValue} disabled={disabled} /> : null}
      {required ? (
        <input
          type="text"
          required
          tabIndex={-1}
          aria-hidden
          value={selectedValue}
          onChange={() => undefined}
          className="sr-only"
        />
      ) : null}
    </div>
  );
}
