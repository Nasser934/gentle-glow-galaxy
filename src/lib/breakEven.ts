import { MAX_BREAK_EVEN_MONTHS, safeBreakEvenRange } from "@/lib/numbers";

const boundedMonth = (value: number): number | null =>
  Number.isFinite(value) && value > 0 && value <= MAX_BREAK_EVEN_MONTHS ? value : null;

/** Extract a bounded canonical break-even month from free-form or legacy notation. */
export function extractBreakEvenMonth(raw: string | undefined | null): number | null {
  const validated = safeBreakEvenRange(raw);
  if (validated) return boundedMonth(validated.low);

  const text = (raw || "").toString();
  let match = text.match(/\bM(\d{1,3})\b/i);
  if (match) return boundedMonth(Number(match[1]));
  match = text.match(/\bY(\d{1,2})\b/i);
  if (match) return boundedMonth(Number(match[1]) * 12);
  return null;
}

/** Return only a bounded, decision-safe break-even label for user-visible surfaces. */
export function formatBreakEvenDisplay(raw: string | undefined | null): string {
  const text = (raw || "").toString().trim();
  const range = safeBreakEvenRange(text);

  if (range) {
    const isYear = /year/i.test(text) && !/month/i.test(text);
    const divisor = isYear ? 12 : 1;
    const low = range.low / divisor;
    const high = range.high / divisor;
    const label = isYear ? "Year" : "Month";
    return low === high ? `${label} ${low}` : `${label} ${low}–${high}`;
  }

  const month = extractBreakEvenMonth(text);
  if (month != null) {
    if (/\bY\d{1,2}\b/i.test(text) && month % 12 === 0) return `Year ${month / 12}`;
    return `Month ${month}`;
  }

  return "Requires validation";
}
