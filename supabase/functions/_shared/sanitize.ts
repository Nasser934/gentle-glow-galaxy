import { sanitizeConsumerText } from "./analysis/wording.ts";

const CONSUMER_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bqa[ -]?failed\b/gi, "evidence is limited"],
  [/\bfallback used\b/gi, "needs validation"],
  [/\btemplate mismatch\b/gi, "input detail is incomplete"],
  [/\bsource notes? empty\b/gi, "evidence is limited"],
  [/\braw (edge|function) error\b/gi, "needs validation"],
  [/\binternal repair attempt\b/gi, "needs validation"],
  [/\brepair attempt\b/gi, "needs validation"],
  [/\bdeveloper (diagnostics?|error)\b/gi, "needs validation"],
  [/\breport quality weak\b/gi, "input detail is incomplete"],
  [/\bdebug\b/gi, ""],
];

export function sanitizeForConsumer(value: unknown): string {
  if (value == null) return "";
  let output = sanitizeConsumerText(value);
  for (const [pattern, replacement] of CONSUMER_REPLACEMENTS) {
    output = output.replace(pattern, replacement);
  }
  return output.replace(/\s{2,}/g, " ").replace(/\s+([.,;:])/g, "$1").trim();
}

const STRUCTURAL_KEYS = new Set([
  "url", "sourceId", "claimId", "supportingSourceIds", "conflictingSourceIds",
  "inputHash", "modelId", "promptVersion", "scoringEngineVersion", "reportSchemaVersion",
]);

/** Deep-walk untrusted model output without mutating URLs, IDs, or audit keys. */
function deepSanitizeValue<T>(value: T, key?: string): T {
  if (key && STRUCTURAL_KEYS.has(key)) return value;
  if (value == null) return value;
  if (typeof value === "string") return sanitizeForConsumer(value) as T;
  if (Array.isArray(value)) return value.map((child) => deepSanitizeValue(child, key)) as T;
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [childKey, child] of Object.entries(value)) output[childKey] = deepSanitizeValue(child, childKey);
    return output as T;
  }
  return value;
}

export function deepSanitize<T>(value: T): T {
  return deepSanitizeValue(value);
}
