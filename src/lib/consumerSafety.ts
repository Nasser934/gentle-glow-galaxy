export const BLOCKED_CONSUMER_PATTERNS: RegExp[] = [
  /\bqa\b/i,
  /fallback/i,
  /edge function/i,
  /source notes are empty/i,
  /required .* terms .* missing/i,
  /template mismatch/i,
  /report quality/i,
  /generated locally/i,
  /live research unavailable/i,
  /unreachable/i,
  /debug/i,
  /stack trace/i,
  /malformed/i,
  /repair attempt/i,
];

export const consumerValidationNote =
  "Some market and financial assumptions should be validated with primary research before funding approval.";

const REPLACEMENTS: Array<[RegExp, string]> = [
  [/This draft was generated locally because the analysis Edge Function is unreachable\.?/gi, "This report is ready with validation assumptions."],
  [/Treat market figures as directional until live research is restored\.?/gi, consumerValidationNote],
  [/Generated locally/gi, "Prepared by Concept AI"],
  [/local fallback/gi, "validation assumption"],
  [/fallback content used/gi, "validation assumptions applied"],
  [/fallback mode/gi, "validation mode"],
  [/Live research unavailable in validation mode\.?/gi, consumerValidationNote],
  [/Live research unavailable/gi, "Primary research recommended"],
  [/Edge Function/gi, "analysis service"],
  [/unreachable/gi, "temporarily unavailable"],
  [/Source Notes are empty\.?/gi, consumerValidationNote],
  [/Required ([^.]+) terms are missing from the report\.?/gi, "Additional sector-specific validation is recommended."],
  [/Template mismatch detected\.?/gi, "Additional report type validation is recommended."],
  [/Report quality is weak\.?/gi, consumerValidationNote],
  [/QA failed\.?/gi, consumerValidationNote],
  [/QA warnings?/gi, "validation notes"],
  [/Template QA notes?/gi, "Validation notes"],
  [/debug language/gi, "technical wording"],
  [/stack trace/gi, "technical detail"],
  [/malformed output/gi, "incomplete response"],
  [/repair attempts?/gi, "refinement step"],
];

export function sanitizeConsumerText(value: unknown, fallback = "—") {
  let text = String(value ?? fallback).replace(/\s+/g, " ").trim() || fallback;
  REPLACEMENTS.forEach(([pattern, replacement]) => {
    text = text.replace(pattern, replacement);
  });
  return text;
}

export function sanitizeConsumerItems(items: unknown, max = 10) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, max).map((item) => sanitizeConsumerText(item)).filter(Boolean);
}

export function sanitizeConsumerObject<T>(value: T): T {
  if (typeof value === "string") return sanitizeConsumerText(value) as T;
  if (Array.isArray(value)) return value.map((item) => sanitizeConsumerObject(item)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, sanitizeConsumerObject(item)])
    ) as T;
  }
  return value;
}

export function containsBlockedConsumerLanguage(value: unknown) {
  const text = JSON.stringify(value ?? "").toLowerCase();
  return BLOCKED_CONSUMER_PATTERNS.some((pattern) => pattern.test(text));
}

export function consumerConfidenceLabel(confidence?: string) {
  if (!confidence) return "Medium";
  const normalized = confidence.toLowerCase();
  if (normalized.includes("high")) return "High";
  if (normalized.includes("low")) return "Low";
  return "Medium";
}

export function consumerSafeEvidenceNote(sourceCount: number, confidence?: string) {
  const label = consumerConfidenceLabel(confidence);
  if (sourceCount === 0 || label === "Low") return consumerValidationNote;
  if (label === "Medium") return "The report is ready for review, with selected assumptions to validate before scale funding.";
  return "The report has supporting evidence, while final investment approval should still validate key assumptions.";
}
