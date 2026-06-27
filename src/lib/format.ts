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
