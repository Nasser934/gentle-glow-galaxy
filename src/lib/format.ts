import type { ConceptInputs, FeasibilityReport } from "@/types/analysis";

/**
 * Normalize any "confidence" value to a percentage string.
 *  - 0.8       -> "80%"
 *  - 80        -> "80%"
 *  - 8000      -> "80%"
 *  - 9500      -> "95%"
 *  - "85%"     -> "85%"
 *  - null/NaN  -> "—"
 */
export const formatConfidence = (raw: unknown): string => {
  const pct = confidencePercent(raw);
  return pct == null ? "—" : `${pct}%`;
};

/**
 * Same as formatConfidence but returns the numeric percent (0-100) or null.
 * Heuristics:
 *   - 0 < n <= 1   → fractional (0.7 → 70%)
 *   - 1 < n <= 10  → 0-10 score scale (7 → 70%)
 *   - 10 < n <= 100 → already a percent
 *   - n > 100      → collapse extra zeros (8000 → 80%)
 */
export const confidencePercent = (raw: unknown): number | null => {
  if (raw == null) return null;
  if (typeof raw === "string" && (raw.trim() === "" || /^n\/?a$/i.test(raw.trim()))) return null;
  let n = typeof raw === "string" ? parseFloat(raw.replace(/[%,\s]/g, "")) : Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n < 0) n = 0;
  if (n > 0 && n <= 1) n = n * 100;
  else if (n > 1 && n <= 10) n = n * 10;
  while (n > 100) n = n / 10;
  return Math.round(n);
};

/** Explicit normalizer for version-comparison/delta math. */
export const normalizeConfidenceToPercent = (raw: unknown): number =>
  confidencePercent(raw) ?? 0;

/**
 * Treat a report as "internal" when LTV:CAC is missing or N/A. Used only for
 * label disambiguation in revenue tables — never affects scoring.
 */
export const isInternalProject = (report: FeasibilityReport, _inputs?: ConceptInputs): boolean => {
  const ltv = (report.financials.ltvCacRatio || "").trim().toLowerCase();
  return ltv === "" || ltv === "—" || ltv === "-" || /n\/?a/.test(ltv);
};

export const internalLabels = {
  customers: "Internal Users",
  revenue: "Annual Savings / Value Realized",
};

export const externalLabels = {
  customers: "Yr 1 Customers",
  revenue: "Annual Revenue",
};

/**
 * Compact a number into K / Mn / Bn / Tn form.
 *   1_200_000      -> "1.2Mn"
 *   55_000_000     -> "55Mn"
 *   1_250_000_000  -> "1.25Bn"
 *   130_000        -> "130K"
 */
export const compactNumber = (n: number): string => {
  if (!Number.isFinite(n)) return "";
  const abs = Math.abs(n);
  const trim = (v: number) => {
    const s = v.toFixed(2);
    return s.replace(/\.?0+$/, "");
  };
  if (abs >= 1e12) return `${trim(n / 1e12)}Tn`;
  if (abs >= 1e9)  return `${trim(n / 1e9)}Bn`;
  if (abs >= 1e6)  return `${trim(n / 1e6)}Mn`;
  if (abs >= 1e3)  return `${trim(n / 1e3)}K`;
  return `${n}`;
};

/**
 * Compact every numeric token inside a currency/range string while preserving
 * currency prefixes/suffixes (SAR, USD, $, €, etc.) and en-dash ranges.
 *
 *   "$1,200,000,000"          -> "$1.2Bn"
 *   "$130,000 - $250,000"     -> "$130K–$250K"
 *   "SAR 2.1B"                -> "SAR 2.1Bn"
 *   "55,000,000"              -> "55Mn"
 *
 * Already-compact suffixes (K, M, B, T) are normalized to (K, Mn, Bn, Tn).
 */
export const compactCurrencyString = (input?: string | null): string => {
  if (input == null) return "—";
  let s = String(input).trim();
  if (!s) return "—";
  // Strip artefact ".000" / ".00" from raw numbers like "1.200.000.000"
  s = s.replace(/\.000\b/g, "").replace(/\.00\b/g, "");
  // Normalize range separators
  s = s.replace(/\s*[-–—]\s*/g, "–");
  // Normalize single-letter suffixes to canonical form, only when not already xN
  s = s.replace(/(\d(?:\.\d+)?)\s*T(?!n|[a-z])/gi, "$1Tn")
       .replace(/(\d(?:\.\d+)?)\s*B(?!n|[a-z])/gi, "$1Bn")
       .replace(/(\d(?:\.\d+)?)\s*M(?!n|[a-z])/gi, "$1Mn")
       .replace(/(\d(?:\.\d+)?)\s*K(?![a-z])/gi, "$1K");
  // Replace bare large numbers (with commas or 4+ digits) with compact form
  s = s.replace(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d{4,}(?:\.\d+)?/g, (m) => {
    const n = Number(m.replace(/,/g, ""));
    if (!Number.isFinite(n)) return m;
    return compactNumber(n);
  });
  return s;
};

