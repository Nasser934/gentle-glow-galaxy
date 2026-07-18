import type { ConceptInputs, FeasibilityReport } from "@/types/analysis";
export { numericRange, numericValue, parseUnitAwareNumber } from "@/lib/numbers";

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

/** Detect the financial model from explicit brief fields before using a legacy fallback. */
export const isInternalConcept = (inputs?: ConceptInputs): boolean => {
  const model = `${inputs?.businessModel ?? ""} ${inputs?.revenueModel ?? ""}`.toLowerCase();
  return /internal platform|cost avoidance|productivity benefit|internal payback/.test(model);
};

/**
 * Treat a report as internal when the canonical project type or brief says so.
 * The LTV:CAC check exists only as a compatibility fallback for legacy rows.
 */
export const isInternalProject = (report: FeasibilityReport, inputs?: ConceptInputs): boolean => {
  if (report.financials.projectType === "internal") return true;
  if (report.financials.projectType === "commercial") return false;
  if (isInternalConcept(inputs)) return true;
  const ltv = (report.financials.ltvCacRatio || "").trim().toLowerCase();
  return ltv === "" || ltv === "—" || ltv === "-" || /n\/?a|not applicable|internal platform/.test(ltv);
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
 * Compact a number into K / M / B / T form (no "n" suffix).
 *   1_200_000      -> "1.2M"
 *   55_000_000     -> "55M"
 *   1_250_000_000  -> "1.3B"
 *   130_000        -> "130K"
 */
export const compactNumber = (n: number): string => {
  if (!Number.isFinite(n)) return "";
  const abs = Math.abs(n);
  const fmt = (v: number, big: number) => {
    const decimals = abs >= big ? 0 : 1;
    return v.toFixed(decimals).replace(/\.?0+$/, "");
  };
  if (abs >= 1e12) return `${fmt(n / 1e12, 1e13)}T`;
  if (abs >= 1e9)  return `${fmt(n / 1e9, 1e10)}B`;
  if (abs >= 1e6)  return `${fmt(n / 1e6, 1e7)}M`;
  if (abs >= 1e3)  return `${Math.round(n / 1e3)}K`;
  return `${n}`;
};

/**
 * Compact every numeric token inside a currency/range string while preserving
 * currency prefixes/suffixes (SAR, USD, $, €, etc.) and en-dash ranges.
 *
 *   "$1,200,000,000"          -> "$1.2B"
 *   "$130,000 - $250,000"     -> "$130K–$250K"
 *   "SAR 2.1B"                -> "SAR 2.1B"
 *   "55,000,000"              -> "55M"
 */
export const compactCurrencyString = (input?: string | null): string => {
  if (input == null) return "—";
  let s = String(input).trim();
  if (!s) return "—";
  s = s.replace(/\.000\b/g, "").replace(/\.00\b/g, "");
  s = s.replace(/\s*[-–—]\s*/g, "–");
  // Normalize legacy "Mn/Bn/Tn" suffixes to single-letter form.
  s = s.replace(/(\d(?:\.\d+)?)\s*Tn\b/gi, "$1T")
       .replace(/(\d(?:\.\d+)?)\s*Bn\b/gi, "$1B")
       .replace(/(\d(?:\.\d+)?)\s*Mn\b/gi, "$1M");
  s = s.replace(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d{4,}(?:\.\d+)?/g, (m) => {
    const n = Number(m.replace(/,/g, ""));
    if (!Number.isFinite(n)) return m;
    return compactNumber(n);
  });
  return s;
};

/** Canonical title-case label for a status value. Internal value stays lowercase. */
export const statusLabel = (s?: string | null): string => {
  switch ((s || "").toLowerCase()) {
    case "draft": return "Draft";
    case "in_review": return "In Review";
    case "approved": return "Approved";
    case "rejected": return "Rejected";
    default: return s ? s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "—";
  }
};

/**
 * Pretty source label for a citation. Prefer the URL hostname (sans "www.")
 * over generic provider labels like "Tavily web". Falls back to the
 * citation source/title.
 */
export const prettifySource = (c?: { source?: string | null; title?: string | null; url?: string | null } | null): string => {
  if (!c) return "Source";
  const raw = (c.source || "").trim();
  const generic = /^(tavily(\s+web)?|web|search|google|bing)$/i.test(raw);
  if (c.url && (generic || !raw)) {
    try {
      const host = new URL(c.url).hostname.replace(/^www\./, "");
      if (host) return host;
    } catch { /* ignore */ }
  }
  return raw || c.title || "Source";
};
