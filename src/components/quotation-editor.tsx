"use client";

import { Button } from "@/components/ui/button";

import { DateTimePicker, DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";


import {
  formatMoney,
  formatPercent,
  formatRateMicro,
  minorToDecimalString,
  parseMoneyToMinor,
  parsePercentToBps,
  parseRateToMicro,
} from "@/lib/money";
import {
  computeOption,
  OPTION_TYPES,
  OPTION_TYPE_LABELS,
  presentOption,
  resolvePriceDisplay,
  resolveTaxDisplay,
  validateQuotationDraft,
  type EditorOption,
  type EditorQuotation,
  type OptionType,
  type VatContext,
} from "@/lib/quotation";
import {
  PRICE_DISPLAY_LABELS,
  PRICE_DISPLAY_MODES,
  SERVICE_UNIT_LABELS,
  SERVICE_UNITS,
  TAX_DISPLAY_LABELS,
  TAX_DISPLAY_MODES,
  type PriceDisplayMode,
  type TaxDisplayMode,
} from "@/lib/pricing/presentation";
import type { PassengerType } from "@/lib/pnr";
import { enteredTravellerNames } from "@/lib/travellers";
import { ConfirmButton } from "@/components/confirm-button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { StatusBadge } from "@/components/ui";
import { Checkbox } from "@/components/ui/checkbox";
import { SelectField } from "@/components/ui/select";
import {
  acceptOptionAction,
  cancelQuotationAction,
  declineQuotationAction,
  deleteQuotationAction,
  duplicateQuotationAction,
  parsePnrAction,
  reviseQuotationAction,
  saveQuotationAction,
  sendQuotationAction,
} from "@/server/actions/quotations";
import type { SaveQuotationInput } from "@/lib/schemas";

interface PassengerChoice {
  id: string;
  name: string;
  type: PassengerType;
  linked: boolean;
}

export interface QuotationEditorProps {
  quotation: EditorQuotation;
  vat: { enabled: boolean; rateBps: string; roundingUnit: string };
  passengers: PassengerChoice[];
  currencies: string[];
  branches: { code: string; name: string }[];
  banks: { id: string; label: string; currency: string; isDefault: boolean }[];
  canEdit: boolean;
  canManage: boolean;
  isAdmin: boolean;
  latestRates: Record<string, { rate: string; effectiveFrom: string } | null>;
  defaultMarginBps: string;
  presentation: {
    defaultPriceDisplay: PriceDisplayMode;
    defaultTaxDisplay: TaxDisplayMode;
    serviceFeeLabel: string;
    taxLabel: string;
    vatLabel: string;
    totalLabel: string;
    perPersonLabel: string;
    taxNote: string;
  };
}

interface DraftSegment {
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

interface DraftFare {
  key: string;
  /** Empty when the travellers are not named yet. */
  passengerId: string;
  passengerName: string;
  passengerType: PassengerType;
  /** Travellers covered by an unnamed fare line. */
  quantity: string;
  cost: string;
  /** Optional names for an unnamed group, one per line. */
  travellerNames: string;
}

interface DraftService {
  key: string;
  category: string;
  description: string;
  details: string;
  quantity: string;
  unit: string;
  cost: string;
}

interface DraftTax {
  key: string;
  name: string;
  kind: "fixed" | "percent";
  value: string;
  enabled: boolean;
  base: "cost" | "markup" | "subtotal";
}

interface DraftOption {
  key: string;
  id?: string;
  label: string;
  optionType: OptionType;
  pnr: string;
  ticketingDeadline: string;
  costCurrency: string;
  rate: string;
  marginKind: "percent" | "lump";
  margin: string;
  segments: DraftSegment[];
  fares: DraftFare[];
  services: DraftService[];
  taxes: DraftTax[];
}

interface HeaderDraft {
  referenceNo: string;
  branch: string;
  currency: string;
  issueDate: string;
  validUntil: string;
  vatOverride: "inherit" | "on" | "off";
  pricingDisplay: "inherit" | PriceDisplayMode;
  taxDisplay: "inherit" | TaxDisplayMode;
  heading: string;
  notes: string;
  bankAccountId: string;
}

type PendingDialog = {
  title: string;
  description: string;
  confirmLabel: string;
  tone?: "danger" | "primary";
  reason?: { label: string; placeholder?: string; required?: boolean };
  onConfirm: (reason: string) => void;
};

const SERVICE_CATEGORIES = [
  ["hotel", "Hotel"],
  ["tour", "Tour"],
  ["cruise", "Cruise"],
  ["car_hire", "Car hire"],
  ["rail", "Rail"],
  ["activity", "Activity"],
  ["visa", "Visa"],
  ["insurance", "Insurance"],
  ["transfer", "Transfer"],
  ["other", "Other"],
] as const;

function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function moneySafe(value: string, currency: string): string {
  try {
    return parseMoneyToMinor(value, currency).toString();
  } catch {
    return "0";
  }
}

function percentSafe(value: string): string {
  try {
    return parsePercentToBps(value).toString();
  } catch {
    return "0";
  }
}

function rateSafe(value: string): string {
  try {
    return parseRateToMicro(value).toString();
  } catch {
    return "0";
  }
}

function derivedUnitCost(cost: string, quantity: string, currency: string): string | undefined {
  const quantityNumber = Math.max(1, Number.parseInt(quantity || "1", 10) || 1);
  if (quantityNumber <= 1) return undefined;
  const total = BigInt(moneySafe(cost, currency));
  const divisor = BigInt(quantityNumber);
  return total % divisor === 0n ? (total / divisor).toString() : undefined;
}

function fromEditorOption(option: EditorOption, currency: string, index: number): DraftOption {
  return {
    key: option.id ?? `option-${index}`,
    id: option.id,
    label: option.label,
    optionType: option.optionType ?? "flight",
    pnr: option.pnr,
    ticketingDeadline: option.ticketingDeadline,
    costCurrency: option.costCurrency,
    rate: formatRateMicro(BigInt(option.rateMicro)),
    marginKind: option.marginKind,
    margin:
      option.marginKind === "percent"
        ? formatPercent(BigInt(option.marginValue)).replace("%", "")
        : minorToDecimalString(BigInt(option.marginValue), currency),
    segments: option.segments.map((segment, segmentIndex) => ({
      key: segment.id ?? `segment-${index}-${segmentIndex}`,
      airline: segment.airline,
      flightNo: segment.flightNo,
      fromIata: segment.fromIata,
      toIata: segment.toIata,
      departLocal: segment.departLocal,
      arriveLocal: segment.arriveLocal,
      cabin: segment.cabin ?? "",
      operatingCarrier: segment.operatingCarrier ?? "",
    })),
    fares: option.fares.map((fare, fareIndex) => ({
      key: fare.id ?? `fare-${index}-${fareIndex}`,
      passengerId: fare.passengerId,
      passengerName: fare.passengerName,
      passengerType: fare.passengerType,
      quantity: fare.quantity ?? "1",
      cost: minorToDecimalString(BigInt(fare.costMinor), option.costCurrency),
      travellerNames: fare.travellerNames ?? "",
    })),
    services: option.services.map((service, serviceIndex) => ({
      key: service.id ?? `service-${index}-${serviceIndex}`,
      category: service.category,
      description: service.description,
      details: service.details ?? "",
      quantity: service.quantity ?? "1",
      unit: service.unit ?? "unit",
      cost: minorToDecimalString(BigInt(service.costMinor), option.costCurrency),
    })),
    taxes: option.taxes.map((tax, taxIndex) => ({
      key: tax.id ?? `tax-${index}-${taxIndex}`,
      name: tax.name,
      kind: tax.kind === "percent" ? "percent" : "fixed",
      value:
        tax.kind === "percent"
          ? formatPercent(BigInt(tax.value)).replace("%", "")
          : minorToDecimalString(BigInt(tax.value), currency),
      enabled: tax.enabled,
      base: tax.base ?? "cost",
    })),
  };
}

function toEditorOption(draft: DraftOption, quotationCurrency: string): EditorOption {
  return {
    id: draft.id,
    label: draft.label.trim() || "Option",
    optionType: draft.optionType,
    pnr: draft.pnr.trim(),
    ticketingDeadline: draft.ticketingDeadline,
    costCurrency: draft.costCurrency,
    rateMicro: rateSafe(draft.rate),
    marginKind: draft.marginKind,
    marginValue:
      draft.marginKind === "percent"
        ? percentSafe(draft.margin)
        : moneySafe(draft.margin, quotationCurrency),
    segments: draft.segments.map((segment) => ({
      airline: segment.airline.trim().toUpperCase(),
      flightNo: segment.flightNo.trim().toUpperCase(),
      fromIata: segment.fromIata.trim().toUpperCase(),
      toIata: segment.toIata.trim().toUpperCase(),
      departLocal: segment.departLocal,
      arriveLocal: segment.arriveLocal,
      cabin: segment.cabin.trim() || undefined,
      operatingCarrier: segment.operatingCarrier.trim() || undefined,
    })),
    fares: draft.fares.map((fare) => ({
      passengerId: fare.passengerId,
      passengerName: fare.passengerName,
      passengerType: fare.passengerType,
      quantity: fare.quantity || "1",
      costMinor: moneySafe(fare.cost, draft.costCurrency),
      travellerNames: fare.passengerId ? undefined : fare.travellerNames,
    })),
    services: draft.services.map((service) => ({
      category: service.category,
      description: service.description.trim(),
      costMinor: moneySafe(service.cost, draft.costCurrency),
      quantity: service.quantity || "1",
      unit: service.unit || "unit",
      unitCostMinor: derivedUnitCost(service.cost, service.quantity, draft.costCurrency),
      details: service.details.trim() || undefined,
    })),
    taxes: draft.taxes.map((tax) => ({
      name: tax.name.trim(),
      kind: tax.kind,
      value: tax.kind === "percent" ? percentSafe(tax.value) : moneySafe(tax.value, quotationCurrency),
      enabled: tax.enabled,
      base: tax.base,
    })),
  };
}

function emptyOption(label: string, currency: string, marginBps: string): DraftOption {
  return {
    key: newKey(),
    label,
    optionType: "flight",
    pnr: "",
    ticketingDeadline: "",
    costCurrency: currency,
    rate: "1",
    marginKind: "percent",
    margin: formatPercent(BigInt(marginBps)).replace("%", ""),
    segments: [],
    fares: [],
    services: [],
    taxes: [],
  };
}

function optionLetter(index: number): string {
  return index < 26 ? String.fromCharCode(65 + index) : String(index + 1);
}

export function QuotationEditor({
  quotation,
  vat,
  passengers,
  currencies,
  branches,
  banks,
  canEdit: canEditProp,
  canManage,
  isAdmin,
  latestRates,
  defaultMarginBps,
  presentation,
}: QuotationEditorProps) {
  const router = useRouter();
  const canEdit = canEditProp && !quotation.locked;
  const [header, setHeader] = useState<HeaderDraft>({
    referenceNo: quotation.referenceNo,
    branch: quotation.branch,
    currency: quotation.currency,
    issueDate: quotation.issueDate,
    validUntil: quotation.validUntil,
    vatOverride:
      quotation.vatOverride === null ? "inherit" : quotation.vatOverride ? "on" : "off",
    pricingDisplay: quotation.pricingDisplay ?? "inherit",
    taxDisplay: quotation.taxDisplay ?? "inherit",
    heading: quotation.heading,
    notes: quotation.notes,
    bankAccountId:
      quotation.bankAccountId || banks.find((bank) => bank.isDefault)?.id || banks[0]?.id || "",
  });
  const [options, setOptions] = useState<DraftOption[]>(() =>
    quotation.options.map((option, index) => fromEditorOption(option, quotation.currency, index)),
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const versionRef = useRef(quotation.version);
  const [saveState, setSaveState] = useState<"saved" | "dirty" | "saving" | "error">("saved");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [pnrText, setPnrText] = useState("");
  const [pnrNotice, setPnrNotice] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const [pendingDialog, setPendingDialog] = useState<PendingDialog | null>(null);
  const savingRef = useRef(false);

  const vatContext = useMemo<VatContext>(
    () => ({
      enabled: header.vatOverride === "inherit" ? vat.enabled : header.vatOverride === "on",
      rateBps: BigInt(vat.rateBps),
      roundingUnit: BigInt(vat.roundingUnit),
    }),
    [header.vatOverride, vat.enabled, vat.rateBps, vat.roundingUnit],
  );

  const priceDisplay = resolvePriceDisplay(
    header.pricingDisplay === "inherit" ? null : header.pricingDisplay,
    presentation.defaultPriceDisplay,
  );
  const taxDisplay = resolveTaxDisplay(
    header.taxDisplay === "inherit" ? null : header.taxDisplay,
    presentation.defaultTaxDisplay,
  );

  const presentationContext = useMemo(
    () => ({
      priceDisplay,
      taxDisplay,
      serviceFeeLabel: presentation.serviceFeeLabel,
      taxLabel: presentation.taxLabel,
      vatLabel: presentation.vatLabel,
      totalLabel: presentation.totalLabel,
      perPersonLabel: presentation.perPersonLabel,
      taxNote: presentation.taxNote || undefined,
    }),
    [priceDisplay, taxDisplay, presentation],
  );

  const computed = useMemo(
    () =>
      options.map((draft) => {
        const option = toEditorOption(draft, header.currency);
        try {
          const result = computeOption(option, vatContext);
          return {
            option,
            result,
            presentation: presentOption(result, option, presentationContext),
          };
        } catch {
          return { option, result: null, presentation: null };
        }
      }),
    [options, header.currency, vatContext, presentationContext],
  );

  const grandTotal = computed.reduce((sum, entry) => sum + (entry.result?.totalMinor ?? 0n), 0n);
  const active = options[activeIndex];

  const validation = useMemo(
    () => validateQuotationDraft(computed.map((entry) => entry.option)),
    [computed],
  );

  const markDirty = useCallback(() => {
    setSaveState("dirty");
    setMessage(null);
    setError(null);
  }, []);

  const updateHeader = useCallback(
    <K extends keyof HeaderDraft>(key: K, value: HeaderDraft[K]) => {
      setHeader((current) => ({ ...current, [key]: value }));
      markDirty();
    },
    [markDirty],
  );

  const updateOption = useCallback(
    (index: number, patch: Partial<DraftOption>) => {
      setOptions((current) =>
        current.map((option, optionIndex) =>
          optionIndex === index ? { ...option, ...patch } : option,
        ),
      );
      markDirty();
    },
    [markDirty],
  );

  const updateSegment = useCallback(
    (optionIndex: number, segmentIndex: number, patch: Partial<DraftSegment>) => {
      setOptions((current) =>
        current.map((option, index) => {
          if (index !== optionIndex) return option;
          return {
            ...option,
            segments: option.segments.map((segment, sIndex) =>
              sIndex === segmentIndex ? { ...segment, ...patch } : segment,
            ),
          };
        }),
      );
      markDirty();
    },
    [markDirty],
  );

  const updateFare = useCallback(
    (optionIndex: number, fareIndex: number, patch: Partial<DraftFare>) => {
      setOptions((current) =>
        current.map((option, index) => {
          if (index !== optionIndex) return option;
          return {
            ...option,
            fares: option.fares.map((fare, fIndex) =>
              fIndex === fareIndex ? { ...fare, ...patch } : fare,
            ),
          };
        }),
      );
      markDirty();
    },
    [markDirty],
  );

  const updateService = useCallback(
    (optionIndex: number, serviceIndex: number, patch: Partial<DraftService>) => {
      setOptions((current) =>
        current.map((option, index) => {
          if (index !== optionIndex) return option;
          return {
            ...option,
            services: option.services.map((service, sIndex) =>
              sIndex === serviceIndex ? { ...service, ...patch } : service,
            ),
          };
        }),
      );
      markDirty();
    },
    [markDirty],
  );

  const updateTax = useCallback(
    (optionIndex: number, taxIndex: number, patch: Partial<DraftTax>) => {
      setOptions((current) =>
        current.map((option, index) => {
          if (index !== optionIndex) return option;
          return {
            ...option,
            taxes: option.taxes.map((tax, tIndex) =>
              tIndex === taxIndex ? { ...tax, ...patch } : tax,
            ),
          };
        }),
      );
      markDirty();
    },
    [markDirty],
  );

  const save = useCallback(
    async (silent = false): Promise<boolean> => {
      if (!canEdit || savingRef.current) return false;
      savingRef.current = true;
      setSaveState("saving");
      setError(null);
      const input: SaveQuotationInput = {
        quotationId: quotation.id,
        version: versionRef.current,
        contactId: quotation.contactId,
        branch: header.branch,
        referenceNo: header.referenceNo,
        currency: header.currency,
        issueDate: header.issueDate,
        validUntil: header.validUntil,
        vatOverride: header.vatOverride,
        pricingDisplay: header.pricingDisplay,
        taxDisplay: header.taxDisplay,
        heading: header.heading,
        notes: header.notes,
        bankAccountId: header.bankAccountId || undefined,
        options: options.map((option) =>
          // Boundary conversion: the editor draft and the Zod schema carry the
          // same shape (money as decimal strings); Zod re-validates server-side.
          toEditorOption(option, header.currency) as SaveQuotationInput["options"][number],
        ),
      };
      const result = await saveQuotationAction(input);
      savingRef.current = false;
      if (result.ok) {
        setSaveState("saved");
        versionRef.current += 1;
        if (!silent) setMessage(result.message ?? "Draft saved");
        // A branch change issues a new number; refresh so the header shows it.
        if (header.branch !== quotation.branch) router.refresh();
        return true;
      }
      setSaveState("error");
      setStale(Boolean(result.stale));
      setError(result.error ?? "Could not save the draft");
      return false;
    },
    [
      canEdit,
      header,
      options,
      quotation.id,
      quotation.contactId,
      quotation.branch,
      router,
    ],
  );

  useEffect(() => {
    if (!canEdit || saveState !== "dirty" || stale) return;
    const timer = setTimeout(() => {
      void save(true);
    }, 2500);
    return () => clearTimeout(timer);
  }, [saveState, save, canEdit, stale]);

  function addOption() {
    const option = emptyOption(`Option ${optionLetter(options.length)}`, header.currency, defaultMarginBps);
    setOptions((current) => [...current, option]);
    setActiveIndex(options.length);
    markDirty();
  }

  function removeOption(index: number) {
    const label = options[index]?.label ?? "This option";
    setPendingDialog({
      title: "Remove option?",
      description: `${label} and its fares, services and taxes will be removed from the draft.`,
      confirmLabel: "Remove option",
      onConfirm: () => {
        setOptions((current) => current.filter((_, optionIndex) => optionIndex !== index));
        setActiveIndex(Math.max(0, index - 1));
        markDirty();
      },
    });
  }

  function addFare() {
    if (!active) return;
    const used = new Set(active.fares.map((fare) => fare.passengerId));
    const unused = passengers.filter((passenger) => !used.has(passenger.id));
    // Prefer a passenger already linked to this customer, but do not block a
    // draft when the agent still has to link them.
    const choice = unused.find((passenger) => passenger.linked) ?? unused[0];
    if (!choice) {
      setError(
        passengers.length === 0
          ? "No active passengers yet. Create one under Passengers, then add the fare."
          : "Every active passenger is already in this option. Add another passenger under Passengers.",
      );
      return;
    }
    updateOption(activeIndex, {
      fares: [
        ...active.fares,
        {
          key: newKey(),
          passengerId: choice.id,
          passengerName: choice.name,
          passengerType: choice.type,
          quantity: "1",
          cost: "",
          travellerNames: "",
        },
      ],
    });
  }

  function addGroupFare() {
    if (!active) return;
    const used = new Set(
      active.fares.filter((fare) => !fare.passengerId).map((fare) => fare.passengerType),
    );
    const type: PassengerType | undefined = (
      ["adult", "child", "infant"] as const
    ).find((candidate) => !used.has(candidate));
    if (!type) {
      setError("Each traveller type can appear once as an unnamed group. Remove one first.");
      return;
    }
    updateOption(activeIndex, {
      fares: [
        ...active.fares,
        {
          key: newKey(),
          passengerId: "",
          passengerName: "",
          passengerType: type,
          quantity: "1",
          cost: "",
          travellerNames: "",
        },
      ],
    });
  }

  function addSegment() {
    if (!active) return;
    updateOption(activeIndex, {
      segments: [
        ...active.segments,
        {
          key: newKey(),
          airline: "",
          flightNo: "",
          fromIata: "",
          toIata: "",
          departLocal: "",
          arriveLocal: "",
          cabin: "",
          operatingCarrier: "",
        },
      ],
    });
  }

  function addService() {
    if (!active) return;
    updateOption(activeIndex, {
      services: [
        ...active.services,
        { key: newKey(), category: "other", description: "", details: "", quantity: "1", unit: "unit", cost: "" },
      ],
    });
  }

  function addTax() {
    if (!active) return;
    updateOption(activeIndex, {
      taxes: [
        ...active.taxes,
        { key: newKey(), name: "", kind: "fixed", value: "", enabled: true, base: "cost" },
      ],
    });
  }

  async function handleParsePnr() {
    setPnrNotice([]);
    setError(null);
    const result = await parsePnrAction(pnrText, Number(header.issueDate.slice(0, 4)));
    if (!result.ok || !result.result) {
      setError(result.error ?? "Could not read that PNR or itinerary");
      return;
    }
    const parsed = result.result;
    const notices: string[] = [];
    if (result.pnrText) setPnrText(result.pnrText);
    if (result.format === "itinerary") notices.push("Converted itinerary to PNR format.");
    if (parsed.segments.some((segment) => segment.flightNo === "XXX")) {
      notices.push("XXX flight numbers are placeholders; replace them before sending.");
    }
    if (parsed.passengers.length === 0) {
      notices.push("No passenger names were found. Add passengers and fare lines before sending.");
    }
    const matches: DraftFare[] = [];
    const unmatched: string[] = [];
    for (const parsedPassenger of parsed.passengers) {
      const name = `${parsedPassenger.firstName} ${parsedPassenger.lastName}`.toUpperCase();
      const match = passengers.find(
        (passenger) => passenger.name.toUpperCase() === name,
      );
      if (match) {
        matches.push({
          key: newKey(),
          passengerId: match.id,
          passengerName: match.name,
          passengerType: match.type,
          quantity: "1",
          cost: "",
          travellerNames: "",
        });
      } else {
        unmatched.push(`${parsedPassenger.firstName} ${parsedPassenger.lastName}`);
      }
    }
    if (unmatched.length > 0) {
      notices.push(
        `Not linked to this customer: ${unmatched.join(", ")}. Add and link them, then choose their fare lines.`,
      );
    }
    const existingByPassenger = new Map(options[activeIndex].fares.map((fare) => [fare.passengerId, fare]));
    const mergedFares = [...options[activeIndex].fares];
    for (const fare of matches) {
      if (!existingByPassenger.has(fare.passengerId)) mergedFares.push(fare);
    }
    updateOption(activeIndex, {
      segments: parsed.segments.map((segment) => ({
        key: newKey(),
        airline: segment.airline,
        flightNo: segment.flightNo,
        fromIata: segment.fromIata,
        toIata: segment.toIata,
        departLocal: segment.departLocal,
        arriveLocal: segment.arriveLocal,
        cabin: segment.cabin ?? "",
        operatingCarrier: segment.operatingCarrier ?? "",
      })),
      ticketingDeadline: parsed.ticketingDeadline ?? "",
      fares: mergedFares,
    });
    setPnrNotice([
      ...notices,
      ...parsed.warnings,
      ...(parsed.unparsed.length > 0
        ? [`Could not read ${parsed.unparsed.length} line(s); add them by hand.`]
        : []),
      `${parsed.segments.length} segment(s) and ${parsed.passengers.length} passenger name(s) read.`,
    ]);
  }

  function handleSend() {
    if (!canEdit) return;
    if (!validation.valid) {
      setError(validation.errors.map((issue) => `${issue.optionLabel}: ${issue.message}`).join("; "));
      return;
    }
    if (validation.requiresZeroFareConfirmation) {
      setPendingDialog({
        title: "Send with zero fares?",
        description:
          "One or more fares are zero. The customer will receive the quotation with these fares.",
        confirmLabel: "Send anyway",
        tone: "primary",
        onConfirm: () => void continueSend(true),
      });
      return;
    }
    void continueSend(false);
  }

  async function continueSend(confirmZeroFare: boolean) {
    if (validation.hasNegativeMargin) {
      if (!isAdmin) {
        setError("Only an administrator can send a quotation with a negative margin.");
        return;
      }
      setPendingDialog({
        title: "Negative margin",
        description:
          "This quotation is priced below cost. Give a reason for the audit log before sending it.",
        confirmLabel: "Continue",
        tone: "primary",
        reason: {
          label: "Reason",
          placeholder: "Why is this quotation being sent below cost?",
          required: true,
        },
        onConfirm: (reason) => void finaliseSend(confirmZeroFare, reason),
      });
      return;
    }
    await finaliseSend(confirmZeroFare);
  }

  async function finaliseSend(confirmZeroFare: boolean, negativeMarginReason?: string) {
    const saved = await save(false);
    if (!saved) return;
    startTransition(async () => {
      const result = await sendQuotationAction(
        quotation.id,
        {
          confirmZeroFare,
          negativeMarginReason,
        },
        versionRef.current,
      );
      if (result.ok) {
        setMessage(result.warning ?? result.message ?? "Quotation sent and locked");
        router.refresh();
      } else {
        setError(result.error ?? "Could not send the quotation");
      }
    });
  }

  function handleAccept(optionId: string) {
    startTransition(async () => {
      const result = await acceptOptionAction(quotation.id, optionId);
      if (result.ok) {
        setMessage(result.message ?? "Option accepted");
        router.refresh();
      } else {
        setError(result.error ?? "Could not accept the option");
      }
    });
  }

  function handleDecline() {
    setPendingDialog({
      title: "Decline quotation",
      description: "The reason is optional and is kept in the audit log.",
      confirmLabel: "Decline quotation",
      tone: "primary",
      reason: {
        label: "Reason (optional)",
        placeholder: "Why is this quotation being declined?",
      },
      onConfirm: (reason) => {
        startTransition(async () => {
          const result = await declineQuotationAction(quotation.id, reason);
          if (result.ok) {
            setMessage(result.message ?? "Quotation declined");
            router.refresh();
          } else {
            setError(result.error ?? "Could not decline the quotation");
          }
        });
      },
    });
  }

  function handleRevise() {
    startTransition(async () => {
      const result = await reviseQuotationAction(quotation.id);
      if (result.ok) router.refresh();
      else setError(result.error ?? "Could not revise the quotation");
    });
  }

  function handleDuplicate() {
    startTransition(async () => {
      const result = await duplicateQuotationAction(quotation.id);
      if (result.ok) router.refresh();
      else setError(result.error ?? "Could not duplicate the quotation");
    });
  }

  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {saveState === "saving"
              ? "Saving…"
              : saveState === "dirty"
                ? "Unsaved changes"
                : saveState === "error"
                  ? "Not saved"
                  : "All changes saved"}
          </span>
          <span className="text-xs text-muted-foreground/70">Autosave every few seconds</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit ? (
            <Button variant="secondary" type="button" onClick={() => void save(false)} disabled={pending || saveState === "saving"}>
              Save draft
            </Button>
          ) : null}
          {canEdit ? (
            <Button variant="default" type="button" onClick={() => void handleSend()} disabled={pending || saveState === "saving"}>
              Mark sent
            </Button>
          ) : null}
          <Link href={`/quotations/${quotation.id}/preview`} className="btn-secondary">
            Preview PDF
          </Link>
          <a href={`/api/pdf/quotation/${quotation.id}`} className="btn-secondary">
            Download PDF
          </a>
          {!quotation.locked && !canEdit ? null : null}
          {quotation.status !== "draft" && canManage ? (
            <Button variant="secondary" type="button" onClick={handleRevise} disabled={pending}>
              Revise
            </Button>
          ) : null}
          {canManage ? (
            <Button variant="secondary" type="button" onClick={handleDuplicate} disabled={pending}>
              Duplicate
            </Button>
          ) : null}
          {canManage && quotation.status === "draft" ? (
            <form action={deleteQuotationAction}>
              <Input type="hidden" name="quotationId" value={quotation.id} />
              <ConfirmButton variant="destructive"
                title="Delete draft quotation?"
                message="This quotation has not been sent. Deleting it cannot be undone."
              >
                Delete draft
              </ConfirmButton>
            </form>
          ) : null}
        </div>
      </div>

      {canManage && quotation.status === "sent" ? (
        <form
          action={cancelQuotationAction}
          className="no-print mb-4 flex flex-wrap items-center justify-end gap-2"
        >
          <Input type="hidden" name="quotationId" value={quotation.id} />
          <Input
            name="reason" className="h-8 w-52 text-xs"
            placeholder="Reason for cancelling"
            required
            minLength={3}
          />
          <ConfirmButton variant="destructive" className="px-3 py-1.5 text-xs"
            title="Cancel quotation?"
            message="This quotation is awaiting a reply and has not been accepted. The customer will no longer be able to accept it."
          >
            Cancel quotation
          </ConfirmButton>
        </form>
      ) : null}

      {canManage && quotation.status === "accepted" && isAdmin ? (
        <form
          action={cancelQuotationAction}
          className="no-print mb-4 flex flex-wrap items-center justify-end gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900/60 dark:bg-amber-950/40"
        >
          <Input type="hidden" name="quotationId" value={quotation.id} />
          <p className="mr-auto text-xs font-medium text-amber-900 dark:text-amber-200">
            Admin only: cancelling the accepted quotation does not cancel issued itineraries or pro
            formas, or reverse payments.
          </p>
          <Input
            name="reason" className="h-8 w-52 text-xs"
            placeholder="Reason for cancelling"
            required
            minLength={3}
          />
          <ConfirmButton variant="destructive" className="px-3 py-1.5 text-xs"
            title="Cancel accepted quotation?"
            message="This quotation has already been accepted. Cancelling it does not cancel issued itineraries or pro formas, or reverse payments. Continue?"
          >
            Cancel accepted quotation
          </ConfirmButton>
        </form>
      ) : null}

      {message ? (
        <div className="no-print mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="no-print mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:text-red-200">
          <p>{error}</p>
          {stale ? (
            <Button variant="secondary" type="button" className="mt-2" onClick={() => router.refresh()}>
              Reload the latest version
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-6">
            <section className="card card-body">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Quotation header</h2>
                  <p className="text-xs text-muted-foreground">
                    {quotation.number} · revision {quotation.revision} · {quotation.contactName}
                  </p>
                </div>
                <StatusBadge status={quotation.status} />
              </div>
              {!canEdit ? (
                <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:text-amber-300 dark:bg-amber-500/10 dark:text-amber-300">
                  {canManage
                    ? "This quotation is locked. Use Revise to make an editable copy."
                    : "This quotation is locked and read-only for your role."}
                </p>
              ) : null}
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Branch code
                  <Input className="mt-1"
                    value={header.branch}
                    disabled={!canEdit}
                    maxLength={2}
                    pattern="\d{2}"
                    list="editor-branch-codes"
                    onChange={(event) => updateHeader("branch", event.target.value.replace(/\D/g, ""))}
                  />
                  <datalist id="editor-branch-codes">
                    {branches.map((branch) => (
                      <option key={branch.code} value={branch.code}>
                        {branch.code} — {branch.name}
                      </option>
                    ))}
                  </datalist>
                  <span className="mt-1 block text-[10px] font-normal normal-case text-muted-foreground">
                    Two digits, used in the quotation number. The number already issued does not change.
                  </span>
                </label>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Reference
                  <Input className="mt-1"
                    value={header.referenceNo}
                    disabled={!canEdit}
                    onChange={(event) => updateHeader("referenceNo", event.target.value)}
                  />
                </label>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Currency
                  <SelectField
                    className="mt-1"
                    value={header.currency}
                    disabled={!canEdit}
                    onValueChange={(currency) => updateHeader("currency", currency)}
                    options={currencies.map((currency) => ({ value: currency, label: currency }))}
                  />
                </label>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Preferred pro forma account
                  <SelectField
                    id="bankAccountId"
                    className="mt-1"
                    value={header.bankAccountId}
                    disabled={!canEdit}
                    placeholder="Use the default account"
                    onValueChange={(bankAccountId) => updateHeader("bankAccountId", bankAccountId)}
                    options={[
                      { value: "", label: "Use the default account" },
                      ...banks.map((bank) => ({
                        value: bank.id,
                        label: `${bank.label} · ${bank.currency}${bank.isDefault ? " (default)" : ""}`,
                      })),
                    ]}
                  />
                  <span className="mt-1 block text-[10px] font-normal normal-case text-muted-foreground">
                    Only used as the default for the pro forma. Bank details are never printed on a
                    quotation.
                  </span>
                </label>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Issue date
                  <DatePicker className="mt-1"
                    value={header.issueDate}
                    disabled={!canEdit}
                    onValueChange={(value) => updateHeader("issueDate", value)}
                  />
                </label>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Valid until
                  <DatePicker className="mt-1"
                    value={header.validUntil}
                    disabled={!canEdit}
                    onValueChange={(value) => updateHeader("validUntil", value)}
                  />
                </label>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  VAT
                  <SelectField
                    className="mt-1"
                    value={header.vatOverride}
                    disabled={!canEdit}
                    onValueChange={(vatOverride) =>
                      updateHeader("vatOverride", vatOverride as HeaderDraft["vatOverride"])
                    }
                    options={[
                      { value: "inherit", label: "Follow global setting" },
                      { value: "on", label: "Charge VAT" },
                      { value: "off", label: "No VAT" },
                    ]}
                  />
                </label>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Price presentation
                  <SelectField
                    className="mt-1"
                    value={header.pricingDisplay}
                    disabled={!canEdit}
                    onValueChange={(value) =>
                      updateHeader("pricingDisplay", value as HeaderDraft["pricingDisplay"])
                    }
                    options={[
                      {
                        value: "inherit",
                        label: `Follow agency default (${PRICE_DISPLAY_LABELS[presentation.defaultPriceDisplay]})`,
                      },
                      ...PRICE_DISPLAY_MODES.map((mode) => ({
                        value: mode,
                        label: PRICE_DISPLAY_LABELS[mode],
                      })),
                    ]}
                  />
                </label>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Tax presentation
                  <SelectField
                    className="mt-1"
                    value={header.taxDisplay}
                    disabled={!canEdit}
                    onValueChange={(value) =>
                      updateHeader("taxDisplay", value as HeaderDraft["taxDisplay"])
                    }
                    options={[
                      {
                        value: "inherit",
                        label: `Follow agency default (${TAX_DISPLAY_LABELS[presentation.defaultTaxDisplay]})`,
                      },
                      ...TAX_DISPLAY_MODES.map((mode) => ({
                        value: mode,
                        label: TAX_DISPLAY_LABELS[mode],
                      })),
                    ]}
                  />
                </label>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:col-span-2">
                  Heading on the quotation
                  <Input className="mt-1"
                    value={header.heading}
                    disabled={!canEdit}
                    placeholder="QUOTATION"
                    maxLength={120}
                    onChange={(event) => updateHeader("heading", event.target.value)}
                  />
                  <span className="mt-1 block text-[10px] font-normal normal-case text-muted-foreground">
                    Leave blank to use “QUOTATION”.
                  </span>
                </label>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:col-span-2">
                  Notes for the customer
                  <Textarea
                    rows={2} className="mt-1"
                    value={header.notes}
                    disabled={!canEdit}
                    onChange={(event) => updateHeader("notes", event.target.value)}
                  />
                </label>
              </div>
            </section>

            <section className="card">
              <div className="flex flex-wrap items-center gap-1 border-b border-border px-3 pt-3">
                {options.map((option, index) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setActiveIndex(index)}
                    className={`rounded-t-lg px-3 py-2 text-sm font-semibold ${
                      index === activeIndex
                        ? "border-b-2 border-brand-700 bg-secondary text-secondary-foreground"
                        : "text-muted-foreground hover:bg-muted/40"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
                {canEdit ? (
                  <button type="button" onClick={addOption} className="ml-auto mb-1 rounded-md px-2 py-1 text-xs font-semibold text-foreground hover:bg-accent">
                    + Add option
                  </button>
                ) : null}
              </div>

              {active ? (
                <div className="card-body space-y-6">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Option label
                      <Input className="mt-1"
                        value={active.label}
                        disabled={!canEdit}
                        onChange={(event) => updateOption(activeIndex, { label: event.target.value })}
                      />
                    </label>
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Option type
                      <SelectField
                        className="mt-1"
                        value={active.optionType}
                        disabled={!canEdit}
                        onValueChange={(value) =>
                          updateOption(activeIndex, { optionType: value as OptionType })
                        }
                        options={OPTION_TYPES.map((type) => ({
                          value: type,
                          label: OPTION_TYPE_LABELS[type],
                        }))}
                      />
                      <span className="mt-1 block text-[10px] font-normal normal-case text-muted-foreground">
                        Flight options need segments. Accommodation, tour and other land options do not.
                      </span>
                    </label>
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      PNR
                      <Input className="mt-1 font-mono uppercase"
                        value={active.pnr}
                        disabled={!canEdit}
                        onChange={(event) => updateOption(activeIndex, { pnr: event.target.value.toUpperCase() })}
                      />
                    </label>
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Ticketing deadline (agency time)
                      <DateTimePicker className="mt-1"
                        value={active.ticketingDeadline}
                        disabled={!canEdit}
                        onValueChange={(value) => updateOption(activeIndex, { ticketingDeadline: value })}
                      />
                    </label>
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Cost currency
                      <SelectField
                        className="mt-1"
                        value={active.costCurrency}
                        disabled={!canEdit}
                        onValueChange={(currency) => {
                          const latest = latestRates[currency];
                          updateOption(activeIndex, {
                            costCurrency: currency,
                            rate: latest?.rate ?? active.rate,
                          });
                        }}
                        options={currencies.map((currency) => ({ value: currency, label: currency }))}
                      />
                    </label>
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Exchange rate
                      <span className="mt-1 flex gap-1">
                        <Input
                          value={active.rate}
                          disabled={!canEdit}
                          onChange={(event) => updateOption(activeIndex, { rate: event.target.value })}
                        />
                        {latestRates[active.costCurrency] ? (
                          <Button variant="secondary"
                            type="button" className="shrink-0 px-2 py-1 text-xs"
                            disabled={!canEdit}
                            onClick={() => updateOption(activeIndex, { rate: latestRates[active.costCurrency]!.rate })}
                            title={`Latest saved rate from ${latestRates[active.costCurrency]!.effectiveFrom}`}
                          >
                            Latest
                          </Button>
                        ) : null}
                      </span>
                      <span className="mt-1 block text-[10px] font-normal normal-case text-muted-foreground">
                        1 {active.costCurrency} = {active.rate || "0"} {header.currency}
                      </span>
                    </label>
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Margin
                      <span className="mt-1 flex gap-1">
                        <SelectField
                          className="w-24"
                          value={active.marginKind}
                          disabled={!canEdit}
                          onValueChange={(kind) => {
                            updateOption(activeIndex, {
                              marginKind: kind as "percent" | "lump",
                              margin: "0",
                            });
                          }}
                          options={[
                            { value: "percent", label: "Percent" },
                            { value: "lump", label: "Lump sum" },
                          ]}
                        />
                        <Input
                          value={active.margin}
                          disabled={!canEdit}
                          onChange={(event) => updateOption(activeIndex, { margin: event.target.value })}
                        />
                      </span>
                      <span className="mt-1 block text-[10px] font-normal normal-case text-muted-foreground">
                        {active.marginKind === "percent" ? "Percent of converted cost" : `Amount in ${header.currency}`}
                      </span>
                    </label>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-foreground">Flights</h3>
                      {canEdit ? (
                        <Button variant="ghost" type="button" className="px-2 py-1 text-xs" onClick={addSegment}>
                          + Add flight
                        </Button>
                      ) : null}
                    </div>
                    {active.segments.length === 0 ? (
                      <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                        No flights yet. Add them with + Add flight, or import a booking below.
                      </p>
                    ) : (
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
                            {active.segments.map((segment, segmentIndex) => (
                              <tr key={segment.key}>
                                <td><Input className="w-16 px-1 py-1" value={segment.airline} disabled={!canEdit} onChange={(e) => updateSegment(activeIndex, segmentIndex, { airline: e.target.value.toUpperCase() })} /></td>
                                <td>
                                  <Input
                                    className={`w-20 px-1 py-1 ${segment.flightNo === "XXX" ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30" : ""}`}
                                    value={segment.flightNo}
                                    title={segment.flightNo === "XXX" ? "Placeholder: the source had no flight number. Replace it before sending." : undefined}
                                    disabled={!canEdit}
                                    onChange={(e) => updateSegment(activeIndex, segmentIndex, { flightNo: e.target.value.toUpperCase() })}
                                  />
                                </td>
                                <td><Input className="w-16 px-1 py-1" value={segment.fromIata} disabled={!canEdit} onChange={(e) => updateSegment(activeIndex, segmentIndex, { fromIata: e.target.value.toUpperCase() })} /></td>
                                <td><Input className="w-16 px-1 py-1" value={segment.toIata} disabled={!canEdit} onChange={(e) => updateSegment(activeIndex, segmentIndex, { toIata: e.target.value.toUpperCase() })} /></td>
                                <td><DateTimePicker className="w-44 px-1 py-1" value={segment.departLocal} disabled={!canEdit} onValueChange={(value) => updateSegment(activeIndex, segmentIndex, { departLocal: value })} /></td>
                                <td><DateTimePicker className="w-44 px-1 py-1" value={segment.arriveLocal} disabled={!canEdit} onValueChange={(value) => updateSegment(activeIndex, segmentIndex, { arriveLocal: value })} /></td>
                                <td><Input className="w-20 px-1 py-1" value={segment.cabin} disabled={!canEdit} onChange={(e) => updateSegment(activeIndex, segmentIndex, { cabin: e.target.value })} /></td>
                                <td><Input className="w-40 px-1 py-1" value={segment.operatingCarrier} placeholder="Same carrier" disabled={!canEdit} onChange={(e) => updateSegment(activeIndex, segmentIndex, { operatingCarrier: e.target.value })} /></td>
                                <td>
                                  {canEdit ? (
                                    <button
                                      type="button"
                                      className="text-xs font-semibold text-red-600 dark:text-red-400"
                                      onClick={() =>
                                        updateOption(activeIndex, {
                                          segments: active.segments.filter((_, index) => index !== segmentIndex),
                                        })
                                      }
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
                    )}
                    {active.segments.some((segment) => segment.flightNo === "XXX") ? (
                      <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                        XXX marks a missing flight number from the source. Replace it before sending.
                      </p>
                    ) : null}

                    <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3">
                      <p className="text-xs font-semibold text-foreground">Import a PNR or itinerary</p>
                      <div className="mt-2 flex flex-wrap items-end gap-2">
                        <label className="flex-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          PNR or itinerary text
                          <Textarea
                            rows={3} className="mt-1 font-mono text-xs"
                            placeholder="Paste booking-system output or one segment per line in itinerary form"
                            value={pnrText}
                            disabled={!canEdit}
                            onChange={(event) => setPnrText(event.target.value)}
                          />
                        </label>
                        <Button variant="secondary"
                          type="button"
                          disabled={!canEdit || pnrText.trim() === ""}
                          onClick={() => void handleParsePnr()}
                        >
                          Read / convert
                        </Button>
                      </div>
                      <p className="mt-1.5 text-[10px] text-muted-foreground">
                        Paste booking-system output or one segment per line. Itinerary lines become a clean PNR
                        before the flights are applied.
                      </p>
                      {pnrNotice.length > 0 ? (
                        <ul className="mt-2 space-y-0.5 text-xs text-foreground">
                          {pnrNotice.map((notice, index) => (
                            <li key={index}>· {notice}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-foreground">Passenger fares</h3>
                      {canEdit ? (
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" type="button" className="px-2 py-1 text-xs" onClick={addFare}>
                            + Add passenger
                          </Button>
                          <Button variant="ghost" type="button" className="px-2 py-1 text-xs" onClick={addGroupFare}>
                            + Add traveller group
                          </Button>
                        </div>
                      ) : null}
                    </div>
                    <p className="mb-2 text-[10px] text-muted-foreground">
                      A named fare is that passenger's cost. A traveller group line stores the cost per
                      traveller; the group total is the unit cost × quantity. Add names to a group when
                      they become available.
                    </p>
                    {active.fares.length === 0 ? (
                      <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                        Add a named passenger fare, or a traveller group when the names are not known yet.
                        Costs are in {active.costCurrency}.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="table min-w-[720px]">
                          <thead>
                            <tr>
                              <th>Passenger</th>
                              <th>Type</th>
                              <th className="w-20">Qty</th>
                              <th className="w-44">Unit cost ({active.costCurrency})</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {active.fares.map((fare, fareIndex) => (
                              <tr key={fare.key}>
                                <td>
                                  {fare.passengerId ? (
                                    <SelectField
                                      className="min-w-[200px] px-2 py-1"
                                      value={fare.passengerId}
                                      disabled={!canEdit}
                                      onValueChange={(passengerId) => {
                                        const choice = passengers.find((passenger) => passenger.id === passengerId);
                                        updateFare(activeIndex, fareIndex, {
                                          passengerId,
                                          passengerName: choice?.name ?? fare.passengerName,
                                          passengerType: choice?.type ?? fare.passengerType,
                                        });
                                      }}
                                      options={passengers.map((passenger) => ({
                                        value: passenger.id,
                                        label: `${passenger.name} (${passenger.type})${passenger.linked ? "" : " · not linked"}`,
                                      }))}
                                    />
                                  ) : (
                                    <div className="min-w-[260px] space-y-1">
                                      <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                        Names to be advised
                                        {enteredTravellerNames(fare.travellerNames).length > 0
                                          ? ` · ${enteredTravellerNames(fare.travellerNames).length}/${fare.quantity || "1"} named`
                                          : ""}
                                      </span>
                                      <Textarea
                                        rows={2}
                                        className="min-w-[240px] font-mono text-xs"
                                        value={fare.travellerNames}
                                        disabled={!canEdit}
                                        placeholder="One name per line (optional)"
                                        onChange={(event) =>
                                          updateFare(activeIndex, fareIndex, {
                                            travellerNames: event.target.value,
                                          })
                                        }
                                      />
                                    </div>
                                  )}
                                </td>
                                <td>
                                  {fare.passengerId ? (
                                    <span className="capitalize text-muted-foreground">{fare.passengerType}</span>
                                  ) : (
                                    <SelectField
                                      className="w-28 px-2 py-1"
                                      value={fare.passengerType}
                                      disabled={!canEdit}
                                      onValueChange={(type) =>
                                        updateFare(activeIndex, fareIndex, { passengerType: type as PassengerType })
                                      }
                                      options={[
                                        { value: "adult", label: "Adult" },
                                        { value: "child", label: "Child" },
                                        { value: "infant", label: "Infant" },
                                      ]}
                                    />
                                  )}
                                </td>
                                <td>
                                  {fare.passengerId ? (
                                    <span className="text-muted-foreground">1</span>
                                  ) : (
                                    <Input
                                      className="w-16 px-2 py-1 text-right"
                                      inputMode="numeric"
                                      value={fare.quantity}
                                      disabled={!canEdit}
                                      onChange={(event) =>
                                        updateFare(activeIndex, fareIndex, { quantity: event.target.value })
                                      }
                                    />
                                  )}
                                </td>
                                <td>
                                  <Input className="px-2 py-1 text-right"
                                    inputMode="decimal"
                                    value={fare.cost}
                                    disabled={!canEdit}
                                    onChange={(event) => updateFare(activeIndex, fareIndex, { cost: event.target.value })}
                                  />
                                  {!fare.passengerId ? (
                                    <span className="mt-0.5 block text-[10px] text-muted-foreground">
                                      {formatMoney(
                                        BigInt(moneySafe(fare.cost, active.costCurrency)) *
                                          BigInt(Math.max(1, Number.parseInt(fare.quantity || "1", 10) || 1)),
                                        active.costCurrency,
                                      )}{" "}
                                      total
                                    </span>
                                  ) : null}
                                </td>
                                <td>
                                  {canEdit ? (
                                    <button
                                      type="button"
                                      className="text-xs font-semibold text-red-600 dark:text-red-400"
                                      onClick={() =>
                                        updateOption(activeIndex, {
                                          fares: active.fares.filter((_, index) => index !== fareIndex),
                                        })
                                      }
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
                    )}
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-foreground">Other services</h3>
                      {canEdit ? (
                        <Button variant="ghost" type="button" className="px-2 py-1 text-xs" onClick={addService}>
                          + Add service
                        </Button>
                      ) : null}
                    </div>
                    {active.services.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Hotels, tours, cruises, car hire, visas, insurance and transfers can be added here.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="table min-w-[1080px]">
                          <thead>
                            <tr>
                              <th>Category</th>
                              <th>Description</th>
                              <th>Details (room, board, supplier)</th>
                              <th className="w-20">Qty</th>
                              <th className="w-32">Unit</th>
                              <th className="w-40">Total cost ({active.costCurrency})</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {active.services.map((service, serviceIndex) => {
                              const unitCost = derivedUnitCost(service.cost, service.quantity, active.costCurrency);
                              return (
                                <tr key={service.key}>
                                  <td>
                                    <SelectField
                                      className="px-2 py-1"
                                      value={service.category}
                                      disabled={!canEdit}
                                      onValueChange={(category) => updateService(activeIndex, serviceIndex, { category })}
                                      options={SERVICE_CATEGORIES.map(([value, label]) => ({ value, label }))}
                                    />
                                  </td>
                                  <td>
                                    <Input className="px-2 py-1"
                                      value={service.description}
                                      disabled={!canEdit}
                                      placeholder="Hilton Garden Inn"
                                      onChange={(event) => updateService(activeIndex, serviceIndex, { description: event.target.value })}
                                    />
                                  </td>
                                  <td>
                                    <Input className="px-2 py-1"
                                      value={service.details}
                                      disabled={!canEdit}
                                      placeholder="Double room, bed & breakfast"
                                      onChange={(event) => updateService(activeIndex, serviceIndex, { details: event.target.value })}
                                    />
                                  </td>
                                  <td>
                                    <Input className="px-2 py-1 text-right"
                                      inputMode="numeric"
                                      value={service.quantity}
                                      disabled={!canEdit}
                                      onChange={(event) => updateService(activeIndex, serviceIndex, { quantity: event.target.value.replace(/\D/g, "") })}
                                    />
                                  </td>
                                  <td>
                                    <SelectField
                                      className="px-2 py-1"
                                      value={service.unit}
                                      disabled={!canEdit}
                                      onValueChange={(unit) => updateService(activeIndex, serviceIndex, { unit })}
                                      options={SERVICE_UNITS.map((unit) => ({
                                        value: unit,
                                        label: SERVICE_UNIT_LABELS[unit],
                                      }))}
                                    />
                                  </td>
                                  <td>
                                    <Input className="px-2 py-1 text-right"
                                      inputMode="decimal"
                                      value={service.cost}
                                      disabled={!canEdit}
                                      onChange={(event) => updateService(activeIndex, serviceIndex, { cost: event.target.value })}
                                    />
                                    {unitCost ? (
                                      <span className="mt-0.5 block text-[10px] text-muted-foreground">
                                        {formatMoney(BigInt(unitCost), active.costCurrency)} per {SERVICE_UNIT_LABELS[service.unit as keyof typeof SERVICE_UNIT_LABELS] ?? service.unit}
                                      </span>
                                    ) : null}
                                  </td>
                                  <td>
                                    {canEdit ? (
                                      <button
                                        type="button"
                                        className="text-xs font-semibold text-red-600 dark:text-red-400"
                                        onClick={() =>
                                          updateOption(activeIndex, {
                                            services: active.services.filter((_, index) => index !== serviceIndex),
                                          })
                                        }
                                      >
                                        Remove
                                      </button>
                                    ) : null}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">Optional taxes</h3>
                        <p className="text-[11px] text-muted-foreground">
                          Add as many as you need. VAT is separate; every enabled tax appears in the itemised tax layout.
                        </p>
                      </div>
                      {canEdit ? (
                        <Button variant="ghost" type="button" className="px-2 py-1 text-xs" onClick={addTax}>
                          + Add tax
                        </Button>
                      ) : null}
                    </div>
                    {active.taxes.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No optional taxes. VAT is handled by the quotation setting above. Optional taxes can be on cost, service fee or subtotal.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="table min-w-[820px]">
                          <thead>
                            <tr>
                              <th>Name</th>
                              <th>Type</th>
                              <th>Value</th>
                              <th>Percentage base</th>
                              <th>Enabled</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {active.taxes.map((tax, taxIndex) => (
                              <tr key={tax.key}>
                                <td>
                                  <Input className="px-2 py-1" value={tax.name} disabled={!canEdit} onChange={(event) => updateTax(activeIndex, taxIndex, { name: event.target.value })} />
                                </td>
                                <td>
                                  <SelectField
                                    className="px-2 py-1"
                                    value={tax.kind}
                                    disabled={!canEdit}
                                    onValueChange={(kind) =>
                                      updateTax(activeIndex, taxIndex, { kind: kind as "fixed" | "percent", value: "" })
                                    }
                                    options={[
                                      { value: "fixed", label: "Fixed" },
                                      { value: "percent", label: "Percent" },
                                    ]}
                                  />
                                </td>
                                <td>
                                  <Input className="px-2 py-1 text-right" value={tax.value} disabled={!canEdit} onChange={(event) => updateTax(activeIndex, taxIndex, { value: event.target.value })} placeholder={tax.kind === "percent" ? "e.g. 2.5" : header.currency} />
                                </td>
                                <td>
                                  <SelectField
                                    className="px-2 py-1"
                                    value={tax.base}
                                    disabled={!canEdit || tax.kind === "fixed"}
                                    onValueChange={(base) =>
                                      updateTax(activeIndex, taxIndex, { base: base as DraftTax["base"] })
                                    }
                                    options={[
                                      { value: "cost", label: "Converted cost" },
                                      { value: "markup", label: "Service fee" },
                                      { value: "subtotal", label: "Cost + service fee" },
                                    ]}
                                  />
                                </td>
                                <td>
                                  <Checkbox checked={tax.enabled} disabled={!canEdit} onCheckedChange={(value) => updateTax(activeIndex, taxIndex, { enabled: value === true })} />
                                </td>
                                <td>
                                  {canEdit ? (
                                    <button
                                      type="button"
                                      className="text-xs font-semibold text-red-600 dark:text-red-400"
                                      onClick={() =>
                                        updateOption(activeIndex, {
                                          taxes: active.taxes.filter((_, index) => index !== taxIndex),
                                        })
                                      }
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
                    )}
                  </div>

                  {canEdit ? (
                    <div className="border-t border-border/70 pt-3">
                      <Button variant="destructive"
                        type="button" className="px-2 py-1 text-xs"
                        onClick={() => removeOption(activeIndex)}
                      >
                        Remove {active.label}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>
          </div>

          <aside className="min-w-0 space-y-4">
            <div className="card card-body">
              <h2 className="text-sm font-semibold text-foreground">Internal pricing</h2>
              <p className="text-[11px] text-muted-foreground">
                Never shown to the customer. VAT is charged on the margin only.
              </p>
              <div className="mt-3 space-y-3">
                {options.map((option, index) => {
                  const result = computed[index]?.result?.result;
                  return (
                    <div key={option.key} className="rounded-lg border border-border p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-foreground">{option.label}</p>
                        <p className="text-xs font-semibold">
                          {computed[index]?.result
                            ? formatMoney(computed[index]!.result!.totalMinor, header.currency)
                            : "—"}
                        </p>
                      </div>
                      {result ? (
                        <dl className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
                          <div className="flex justify-between"><dt>Cost</dt><dd>{formatMoney(result.costTotalMinor, header.currency)}</dd></div>
                          <div className="flex justify-between"><dt>Markup</dt><dd>{formatMoney(result.markupMinor, header.currency)}</dd></div>
                          <div className="flex justify-between"><dt>VAT on markup</dt><dd>{formatMoney(result.vatMinor, header.currency)}</dd></div>
                          <div className="flex justify-between"><dt>Optional taxes</dt><dd>{formatMoney(result.taxesMinor, header.currency)}</dd></div>
                          <div className="flex justify-between border-t border-border pt-1 font-semibold text-foreground"><dt>Total</dt><dd>{formatMoney(result.totalMinor, header.currency)}</dd></div>
                          <div className="flex justify-between text-emerald-700 dark:text-emerald-300"><dt>Profit (markup)</dt><dd>{formatMoney(result.profitMinor, header.currency)}</dd></div>
                        </dl>
                      ) : (
                        <p className="mt-2 text-[11px] text-muted-foreground/70">Add a fare or service to calculate.</p>
                      )}
                    </div>
                  );
                })}
                <div className="flex items-center justify-between border-t border-border pt-2 text-sm font-bold text-foreground">
                  <span>Grand total</span>
                  <span>{formatMoney(grandTotal, header.currency)}</span>
                </div>
              </div>
            </div>

            {computed[activeIndex]?.presentation ? (
              <div className="card card-body">
                <h2 className="text-sm font-semibold text-foreground">Customer price preview</h2>
                <p className="text-[11px] text-muted-foreground">
                  {PRICE_DISPLAY_LABELS[computed[activeIndex]!.presentation!.priceDisplay]} ·{" "}
                  {TAX_DISPLAY_LABELS[computed[activeIndex]!.presentation!.taxDisplay]}
                </p>
                <table className="mt-3 w-full text-[11px]">
                  <tbody>
                    {computed[activeIndex]!.presentation!.lines.map((line, index) => (
                      <tr key={`${line.description}-${index}`} className="align-top">
                        <td className="py-0.5 pr-2">
                          {line.description}
                          {line.detail ? (
                            <span className="block text-[10px] text-muted-foreground">{line.detail}</span>
                          ) : null}
                          {line.quantity && line.unit ? (
                            <span className="block text-[10px] text-muted-foreground">
                              {line.quantity} {line.unit.replace("_", " / ")}
                              {line.unitAmountMinor
                                ? ` × ${formatMoney(BigInt(line.unitAmountMinor), header.currency)}`
                                : ""}
                            </span>
                          ) : null}
                        </td>
                        <td className="py-0.5 text-right tabular-nums">
                          {formatMoney(BigInt(line.amountMinor), header.currency)}
                        </td>
                      </tr>
                    ))}
                    {BigInt(computed[activeIndex]!.presentation!.serviceFeeMinor) !== 0n ? (
                      <tr>
                        <td className="py-0.5 pr-2">{computed[activeIndex]!.presentation!.serviceFeeLabel}</td>
                        <td className="py-0.5 text-right tabular-nums">
                          {formatMoney(BigInt(computed[activeIndex]!.presentation!.serviceFeeMinor), header.currency)}
                        </td>
                      </tr>
                    ) : null}
                    {computed[activeIndex]!.presentation!.taxLines.map((tax, index) => (
                      <tr key={`${tax.name}-${index}`}>
                        <td className="py-0.5 pr-2">{tax.name}</td>
                        <td className="py-0.5 text-right tabular-nums">
                          {formatMoney(BigInt(tax.amountMinor), header.currency)}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t border-border font-semibold text-foreground">
                      <td className="pt-1 pr-2">{computed[activeIndex]!.presentation!.totalLabel}</td>
                      <td className="pt-1 text-right tabular-nums">
                        {formatMoney(BigInt(computed[activeIndex]!.presentation!.totalMinor), header.currency)}
                      </td>
                    </tr>
                  </tbody>
                </table>
                {computed[activeIndex]!.presentation!.perPersonMinor ? (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {computed[activeIndex]!.presentation!.perPersonLabel}:{" "}
                    <span className="font-semibold text-foreground">
                      {formatMoney(BigInt(computed[activeIndex]!.presentation!.perPersonMinor!), header.currency)}
                    </span>
                  </p>
                ) : null}
                {computed[activeIndex]!.presentation!.taxNote ? (
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    {computed[activeIndex]!.presentation!.taxNote}
                  </p>
                ) : null}
              </div>
            ) : null}

            {validation.errors.length > 0 || validation.warnings.length > 0 ? (
              <div className="card card-body">
                <h2 className="text-sm font-semibold text-foreground">Send checks</h2>
                <ul className="mt-2 space-y-1 text-[11px]">
                  {validation.errors.map((issue, index) => (
                    <li key={`e-${index}`} className="text-red-700 dark:text-red-300">✕ {issue.optionLabel}: {issue.message}</li>
                  ))}
                  {validation.warnings.map((issue, index) => (
                    <li key={`w-${index}`} className="text-amber-700 dark:text-amber-300">! {issue.optionLabel}: {issue.message}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {quotation.status === "sent" ? (
              <div className="card card-body space-y-2">
                <h2 className="text-sm font-semibold text-foreground">Customer reply</h2>
                <p className="text-xs text-muted-foreground">Accept exactly one option, or decline the quotation.</p>
                {quotation.options.map((option) =>
                  option.id ? (
                    <Button variant="default"
                      key={option.id}
                      type="button" className="w-full"
                      disabled={pending}
                      onClick={() => handleAccept(option.id!)}
                    >
                      Accept {option.label}
                    </Button>
                  ) : null,
                )}
                <Button variant="destructive" type="button" className="w-full" disabled={pending} onClick={handleDecline}>
                  Decline quotation
                </Button>
              </div>
            ) : null}

            {quotation.status === "accepted" ? (
              <div className="card card-body space-y-3">
                <h2 className="text-sm font-semibold text-foreground">Accepted</h2>
                <p className="text-xs text-muted-foreground">
                  The accepted option is ready for an itinerary and pro forma on the quotation page.
                </p>
                {isAdmin ? (
                  <p className="border-t border-border/70 pt-3 text-[11px] text-muted-foreground">
                    Administrators can cancel this accepted quotation from the admin control at the
                    top of the page. Issued itineraries, pro formas and payments are left unchanged.
                  </p>
                ) : null}
              </div>
            ) : null}
          </aside>
        </div>

      <ConfirmDialog
        open={pendingDialog !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setPendingDialog(null);
        }}
        title={pendingDialog?.title ?? ""}
        description={pendingDialog?.description}
        confirmLabel={pendingDialog?.confirmLabel}
        tone={pendingDialog?.tone}
        reason={pendingDialog?.reason}
        onConfirm={(reason) => {
          const pendingAction = pendingDialog;
          setPendingDialog(null);
          pendingAction?.onConfirm(reason);
        }}
      />
    </div>
  );
}
