export type CurrencyCode = "SAR" | "USD" | "AED" | "EUR" | "GBP";
export type NumericUnit = "money" | "percent" | "month" | "year" | "number";

export interface ParsedUnitAwareNumber {
  raw: string;
  valid: boolean;
  value: number | null;
  low: number | null;
  high: number | null;
  currency: CurrencyCode | null;
  unit: NumericUnit | null;
  displayText: string;
}
const SCALE: Record<string, number> = {
  k: 1_000,
  thousand: 1_000,
  m: 1_000_000,
  million: 1_000_000,
  b: 1_000_000_000,
  billion: 1_000_000_000,
  t: 1_000_000_000_000,
  trillion: 1_000_000_000_000,
};

const TOKEN_RE = /-?\d[\d,]*(?:\.\d+)?\s*(?:thousand|million|billion|trillion|[kmbt])?/gi;

function currencyFromText(text: string): CurrencyCode | null {
  const code = text.match(/\b(SAR|USD|AED|EUR|GBP)\b/i)?.[1]?.toUpperCase();
  if (code && ["SAR", "USD", "AED", "EUR", "GBP"].includes(code)) return code as CurrencyCode;
  if (/\$/.test(text)) return "USD";
  if (/€/.test(text)) return "EUR";
  if (/£/.test(text)) return "GBP";
  return null;
}

function tokenParts(token: string): { number: number; scale: number | null } | null {
  const match = token.trim().match(/^(-?\d[\d,]*(?:\.\d+)?)\s*(thousand|million|billion|trillion|[kmbt])?$/i);
  if (!match) return null;
  const number = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(number)) return null;
  const suffix = match[2]?.toLowerCase();
  return { number, scale: suffix ? SCALE[suffix] : null };
}

function scaled(parts: { number: number; scale: number | null }, inheritedScale?: number | null): number {
  return parts.number * (parts.scale ?? inheritedScale ?? 1);
}

export function parseUnitAwareNumber(raw: unknown): ParsedUnitAwareNumber {
  const displayText = raw == null ? "" : String(raw).trim();
  const missing: ParsedUnitAwareNumber = {
    raw: displayText,
    valid: false,
    value: null,
    low: null,
    high: null,
    currency: null,
    unit: null,
    displayText,
  };
  if (!displayText || /^(?:n\/?a|none|null|undefined|—|requires validation)$/i.test(displayText)) return missing;

  const tokens = displayText.match(TOKEN_RE) ?? [];
  const parts = tokens.map(tokenParts).filter((item): item is { number: number; scale: number | null } => item !== null);
  if (parts.length === 0) return missing;

  const currency = currencyFromText(displayText);
  const isMonth = /\bmonths?\b/i.test(displayText);
  const isYear = /\byears?\b/i.test(displayText);
  const isPercent = /%|\bpercent(?:age)?\b/i.test(displayText);
  const hasScale = parts.some((part) => part.scale !== null);
  const unit: NumericUnit = isMonth
    ? "month"
    : isYear
      ? "year"
      : isPercent
        ? "percent"
        : currency || hasScale
          ? "money"
          : "number";

  const rangeSyntax = parts.length >= 2 && /(?:\d|[kmbt])\s*(?:–|—|-|\bto\b)\s*(?:\d|[kmbt])/i.test(displayText);
  if (rangeSyntax) {
    const first = parts[0];
    const second = parts[1];
    const low = scaled(first, first.scale === null ? second.scale : null);
    const high = scaled(second, second.scale === null ? first.scale : null);
    if (!Number.isFinite(low) || !Number.isFinite(high)) return missing;
    const orderedLow = Math.min(low, high);
    const orderedHigh = Math.max(low, high);
    return {
      raw: displayText,
      valid: true,
      value: (orderedLow + orderedHigh) / 2,
      low: orderedLow,
      high: orderedHigh,
      currency,
      unit,
      displayText,
    };
  }

  const value = scaled(parts[0]);
  if (!Number.isFinite(value)) return missing;
  return { raw: displayText, valid: true, value, low: null, high: null, currency, unit, displayText };
}

export function numericValue(raw: unknown, fallback = 0): number {
  return parseUnitAwareNumber(raw).value ?? fallback;
}

export function numericRange(raw: unknown): { low: number; high: number } | null {
  const parsed = parseUnitAwareNumber(raw);
  if (!parsed.valid || parsed.value === null) return null;
  return {
    low: parsed.low ?? parsed.value,
    high: parsed.high ?? parsed.value,
  };
}
