/**
 * Money helpers. Money is always BigInt minor units; decimal strings are
 * parsed with integer arithmetic so no floating point ever touches an amount.
 */

export interface CurrencyInfo {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
}

export const CURRENCIES: Record<string, CurrencyInfo> = {
  MWK: { code: "MWK", name: "Malawian Kwacha", symbol: "MK", decimals: 2 },
  USD: { code: "USD", name: "US Dollar", symbol: "$", decimals: 2 },
  EUR: { code: "EUR", name: "Euro", symbol: "€", decimals: 2 },
  GBP: { code: "GBP", name: "Pound Sterling", symbol: "£", decimals: 2 },
  ZAR: { code: "ZAR", name: "South African Rand", symbol: "R", decimals: 2 },
  KES: { code: "KES", name: "Kenyan Shilling", symbol: "KSh", decimals: 2 },
  TZS: { code: "TZS", name: "Tanzanian Shilling", symbol: "TSh", decimals: 0 },
  AUD: { code: "AUD", name: "Australian Dollar", symbol: "A$", decimals: 2 },
  CAD: { code: "CAD", name: "Canadian Dollar", symbol: "C$", decimals: 2 },
  CHF: { code: "CHF", name: "Swiss Franc", symbol: "CHF", decimals: 2 },
  AED: { code: "AED", name: "UAE Dirham", symbol: "AED", decimals: 2 },
  SAR: { code: "SAR", name: "Saudi Riyal", symbol: "SAR", decimals: 2 },
  QAR: { code: "QAR", name: "Qatari Riyal", symbol: "QAR", decimals: 2 },
  INR: { code: "INR", name: "Indian Rupee", symbol: "₹", decimals: 2 },
  JPY: { code: "JPY", name: "Japanese Yen", symbol: "¥", decimals: 0 },
  CNY: { code: "CNY", name: "Chinese Yuan", symbol: "CN¥", decimals: 2 },
  NZD: { code: "NZD", name: "New Zealand Dollar", symbol: "NZ$", decimals: 2 },
  SGD: { code: "SGD", name: "Singapore Dollar", symbol: "S$", decimals: 2 },
  HKD: { code: "HKD", name: "Hong Kong Dollar", symbol: "HK$", decimals: 2 },
  THB: { code: "THB", name: "Thai Baht", symbol: "฿", decimals: 2 },
  TRY: { code: "TRY", name: "Turkish Lira", symbol: "₺", decimals: 2 },
  BRL: { code: "BRL", name: "Brazilian Real", symbol: "R$", decimals: 2 },
  MXN: { code: "MXN", name: "Mexican Peso", symbol: "MX$", decimals: 2 },
  NGN: { code: "NGN", name: "Nigerian Naira", symbol: "₦", decimals: 2 },
  GHS: { code: "GHS", name: "Ghanaian Cedi", symbol: "GH₵", decimals: 2 },
  UGX: { code: "UGX", name: "Ugandan Shilling", symbol: "USh", decimals: 0 },
  ZMW: { code: "ZMW", name: "Zambian Kwacha", symbol: "ZK", decimals: 2 },
  BWP: { code: "BWP", name: "Botswana Pula", symbol: "P", decimals: 2 },
  MUR: { code: "MUR", name: "Mauritian Rupee", symbol: "₨", decimals: 2 },
  MAD: { code: "MAD", name: "Moroccan Dirham", symbol: "MAD", decimals: 2 },
  EGP: { code: "EGP", name: "Egyptian Pound", symbol: "E£", decimals: 2 },
};

export function currencyInfo(code: string): CurrencyInfo {
  return (
    CURRENCIES[code.toUpperCase()] ?? {
      code: code.toUpperCase(),
      name: code.toUpperCase(),
      symbol: code.toUpperCase(),
      decimals: 2,
    }
  );
}

export function minorUnitFactor(currency: string): bigint {
  return 10n ** BigInt(currencyInfo(currency).decimals);
}

export function formatMoney(
  minor: bigint,
  currency: string,
  options: { withSymbol?: boolean; decimals?: number } = {},
): string {
  const info = currencyInfo(currency);
  const decimals = options.decimals ?? info.decimals;
  const negative = minor < 0n;
  const absolute = negative ? -minor : minor;
  const factor = 10n ** BigInt(info.decimals);

  let major = absolute / factor;
  let fraction = absolute % factor;

  if (decimals < info.decimals) {
    const drop = 10n ** BigInt(info.decimals - decimals);
    const rounded = (fraction + drop / 2n) / drop;
    major += rounded / (10n ** BigInt(decimals));
    fraction = rounded % (10n ** BigInt(decimals));
  } else if (decimals > info.decimals) {
    fraction *= 10n ** BigInt(decimals - info.decimals);
  }

  const grouped = major.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fractionText = decimals > 0 ? `.${fraction.toString().padStart(decimals, "0")}` : "";
  const amount = `${grouped}${fractionText}`;
  const withSymbol = options.withSymbol ?? true;
  return `${negative ? "-" : ""}${withSymbol ? `${info.code} ` : ""}${amount}`;
}

/** Format a minor-unit amount as a plain decimal string for form inputs. */
export function minorToDecimalString(minor: bigint, currency: string): string {
  const info = currencyInfo(currency);
  const factor = 10n ** BigInt(info.decimals);
  const negative = minor < 0n;
  const absolute = negative ? -minor : minor;
  const major = absolute / factor;
  const fraction = absolute % factor;
  if (info.decimals === 0) return `${negative ? "-" : ""}${major}`;
  return `${negative ? "-" : ""}${major}.${fraction.toString().padStart(info.decimals, "0")}`;
}

/**
 * Parse a user-entered amount into minor units. Accepts "1,234.56" or
 * "1234". Rejects more decimal places than the currency has.
 */
export function parseMoneyToMinor(input: string, currency: string): bigint {
  const cleaned = input.trim().replace(/,/g, "").replace(/\s/g, "");
  if (cleaned === "") throw new Error("Amount is required");
  if (cleaned.length > 24) throw new Error("Amount is too large");
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(cleaned);
  if (!match) throw new Error("Amount must be a number");
  const [, sign, whole, fractionRaw = ""] = match;
  if (whole.length > 15) throw new Error("Amount is too large");
  const decimals = currencyInfo(currency).decimals;
  if (fractionRaw.length > decimals) {
    throw new Error(`Amount cannot have more than ${decimals} decimal places`);
  }
  const fraction = fractionRaw.padEnd(decimals, "0");
  const factor = 10n ** BigInt(decimals);
  const value = BigInt(whole) * factor + BigInt(fraction || "0");
  return sign === "-" ? -value : value;
}

/** Basis points from a user-entered percentage, e.g. "16.5" -> 1650n. */
export function parsePercentToBps(input: string): bigint {
  const cleaned = input.trim().replace(/%/g, "");
  if (cleaned === "") throw new Error("Percentage is required");
  if (cleaned.length > 16) throw new Error("Percentage is too large");
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(cleaned);
  if (!match) throw new Error("Percentage must be a number");
  const [, sign, whole, fractionRaw = ""] = match;
  if (whole.length > 5) throw new Error("Percentage is too large");
  if (fractionRaw.length > 2) throw new Error("Percentage cannot have more than two decimal places");
  const fraction = fractionRaw.padEnd(2, "0");
  const value = BigInt(whole) * 100n + BigInt(fraction || "0");
  return sign === "-" ? -value : value;
}

export function formatPercent(bps: bigint): string {
  const negative = bps < 0n;
  const absolute = negative ? -bps : bps;
  const whole = absolute / 100n;
  const fraction = absolute % 100n;
  const text =
    fraction === 0n
      ? whole.toString()
      : `${whole}.${fraction.toString().padStart(2, "0").replace(/0$/, "")}`;
  return `${negative ? "-" : ""}${text}%`;
}

/**
 * Exchange rate parsing. Stored as rate x 1,000,000. Six decimal places
 * are accepted, e.g. "1750.5" -> 1_750_500_000n.
 */
export function parseRateToMicro(input: string): bigint {
  const cleaned = input.trim().replace(/,/g, "");
  if (cleaned === "") throw new Error("Rate is required");
  if (cleaned.length > 24) throw new Error("Rate is too large");
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(cleaned);
  if (!match) throw new Error("Rate must be a number");
  const [, sign, whole, fractionRaw = ""] = match;
  if (whole.length > 9) throw new Error("Rate is too large");
  if (fractionRaw.length > 6) throw new Error("Rate cannot have more than six decimal places");
  const fraction = fractionRaw.padEnd(6, "0");
  const value = BigInt(whole) * 1_000_000n + BigInt(fraction || "0");
  return sign === "-" ? -value : value;
}

export function formatRateMicro(micro: bigint): string {
  const negative = micro < 0n;
  const absolute = negative ? -micro : micro;
  const whole = absolute / 1_000_000n;
  const fraction = (absolute % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}
