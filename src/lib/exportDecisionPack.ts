// =============================================================================
// Canonical Export Decision Pack
// -----------------------------------------------------------------------------
// One shared normalized data model used by PDF, PowerPoint, and Excel exports
// so the three formats never disagree on verdict, break-even, financial labels,
// risk counts, or source labels.
//
// IMPORTANT: This module does NOT recompute scores, financials, or evidence.
// It only NORMALIZES presentation of values already produced by the analysis
// pipeline. No DB, RLS, or report-generation logic is touched here.
// =============================================================================

import type {
  ConceptInputs,
  FeasibilityReport,
  RiskRow,
  ResearchCitation,
} from "@/types/analysis";
import {
  compactCurrencyString,
  compactNumber,
  confidencePercent,
  prettifySource,
} from "@/lib/format";

/* --------------------------------- Types ---------------------------------- */

export type CanonicalVerdict =
  | "Proceed"
  | "Proceed with Caution"
  | "Revise"
  | "Do Not Proceed";

export interface VersionFamilyEntry {
  id: string;
  slug?: string | null;
  title?: string | null;
  created_at: string;
  isCurrent?: boolean;
}

export interface CanonicalIdentity {
  reportId: string;
  projectName: string;
  industry: string;
  location: string;
  date: string;
}

export interface CanonicalVerdictBlock {
  canonical: CanonicalVerdict;
  raw: string;
}

export interface CanonicalScore {
  overall: number;
  decisionConfidencePct: number | null;
  confidenceLabel: "High" | "Medium" | "Low" | "Unknown";
}

export interface CanonicalFinancial {
  currency: string;
  /** Compact display, e.g. "$380K–$620K". Same string everywhere. */
  investmentRange: string;
  /** Compact mid CapEx, e.g. "$500K". Always separate from investment range. */
  capexMid: string;
  /** Compact monthly OpEx, e.g. "$45K/mo". */
  monthlyOpex: string;
  /** Compact initial funding need (defaults to CapEx mid + 6 months OpEx if missing). */
  initialFundingNeed: string;
  /** Extracted month integer if recoverable, else null. */
  breakEvenMonth: number | null;
  /** Single canonical break-even display, e.g. "Month 26" or "Year 3". */
  breakEvenDisplay: string;
  /** Raw break-even summary (range, if provided). */
  breakEvenRange: string;
  ltvCac: string;
}

export interface CanonicalMarket {
  currency: string;
  tam: string;
  sam: string;
  som: string;
  cagr: string;
  growthSeries: Array<{ year: string; tam: number; sam: number }>;
}

export interface CanonicalRisk {
  highRiskCount: number;
  materialRiskCount: number;
  topRisks: RiskRow[];
}

export interface CanonicalEvidenceClaim {
  claimId: string;
  claimText: string;
  confidence: string;
  sources: Array<{
    title: string;
    domain: string;
    url: string;
    sourceType?: string;
  }>;
  supportsClaimIds: string[];
}

export interface CanonicalEvidence {
  mix: {
    userInputPercent: number;
    webResearchPercent: number;
    aiAssumptionPercent: number;
  };
  topClaims: CanonicalEvidenceClaim[];
}

export interface CanonicalRoadmap {
  next30: string[];
  days31to60: string[];
  days61to90: string[];
}

export interface ExportDecisionPack {
  identity: CanonicalIdentity;
  verdict: CanonicalVerdictBlock;
  score: CanonicalScore;
  financial: CanonicalFinancial;
  market: CanonicalMarket;
  risk: CanonicalRisk;
  evidence: CanonicalEvidence;
  roadmap: CanonicalRoadmap;
  versionFamily?: VersionFamilyEntry[];
}

/* -------------------------------- Verdict --------------------------------- */

export function canonicalizeVerdict(raw: string | undefined | null): CanonicalVerdict {
  const t = (raw || "").toString().trim().toLowerCase();
  if (!t) return "Proceed with Caution";
  if (t === "proceed") return "Proceed";
  if (/^do not proceed$|^reject$|^do-not-proceed$/.test(t)) return "Do Not Proceed";
  if (/^revise$|^improve inputs/.test(t)) return "Revise";
  if (/conditional|caution|with validation/.test(t)) return "Proceed with Caution";
  if (/proceed/.test(t)) return "Proceed";
  return "Proceed with Caution";
}

/* ------------------------------- Break-even ------------------------------- */

/** Extract a single canonical break-even month from any free-form string. */
export function extractBreakEvenMonth(raw: string | undefined | null): number | null {
  const t = (raw || "").toString();
  if (!t) return null;
  // "Month 26", "in month 26", "month-26"
  let m = t.match(/month[\s-]*(\d{1,3})/i);
  if (m) return Number(m[1]);
  // "26 months", "26-28 months" → take low end
  m = t.match(/(\d{1,3})\s*(?:–|-|to)\s*(\d{1,3})\s*months?/i);
  if (m) return Number(m[1]);
  m = t.match(/(\d{1,3})\s*months?\b/i);
  if (m) return Number(m[1]);
  // "M26"
  m = t.match(/\bM(\d{1,3})\b/);
  if (m) return Number(m[1]);
  // "Year 3" → 36
  m = t.match(/year[\s-]*(\d{1,2})/i);
  if (m) return Number(m[1]) * 12;
  m = t.match(/\bY(\d{1,2})\b/);
  if (m) return Number(m[1]) * 12;
  return null;
}

function buildBreakEvenDisplay(raw: string | undefined | null, month: number | null): string {
  const t = (raw || "").toString().trim();
  if (month != null) {
    // Prefer Month N when month value exists.
    if (month > 0 && month % 12 === 0 && /year/i.test(t) && !/month/i.test(t)) {
      return `Year ${month / 12}`;
    }
    return `Month ${month}`;
  }
  return t || "Requires validation";
}

/* ---------------------------- Financial helpers --------------------------- */

const numFromString = (s?: string): number => {
  if (!s) return 0;
  const m = s.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : 0;
};

function withCurrencyPrefix(value: string, currency: string): string {
  const v = (value || "").trim();
  if (!v || v === "—") return v || "—";
  const cur = (currency || "").trim();
  if (!cur) return v;
  // Avoid double prefix
  if (new RegExp(`^${cur}\\b`, "i").test(v) || /^[$€£¥]/.test(v)) return v;
  return `${cur} ${v}`;
}

function compactMoney(value: number, currency: string): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  const compact = compactNumber(value);
  const cur = (currency || "").trim();
  return cur ? `${cur} ${compact}` : compact;
}

/* ---------------------------- Risk normalization -------------------------- */

const riskLevelText = (r: RiskRow): string =>
  `${(r as any).severity ?? ""} ${r.level ?? ""}`.trim();

const isHigh = (r: RiskRow): boolean => /\b(high|critical)\b/i.test(riskLevelText(r));

const isMaterial = (r: RiskRow): boolean =>
  isHigh(r) || /\b(med|medium)\b/i.test(riskLevelText(r));

/* ------------------------------ Evidence ---------------------------------- */

function buildTopClaims(report: FeasibilityReport): CanonicalEvidenceClaim[] {
  const claims = (report.claimEvidenceMap || []).slice(0, 5);
  const citations: ResearchCitation[] = report.research?.citations || [];
  return claims.map((c, idx) => {
    const claimId = (c.claimId && /^C-\d{2}$/.test(c.claimId))
      ? c.claimId
      : `C-${String(idx + 1).padStart(2, "0")}`;
    const sourceNames = c.sources || [];
    const matched = sourceNames
      .map((name) => citations.find(
        (cit) => cit.title === name || cit.source === name || cit.url === name,
      ))
      .filter((x): x is ResearchCitation => !!x);
    const sources = (matched.length ? matched : citations.slice(0, 2)).map((cit) => {
      let domain = "";
      try { domain = new URL(cit.url).hostname.replace(/^www\./, ""); } catch { /* ignore */ }
      return {
        title: cit.title || prettifySource(cit),
        domain: domain || prettifySource({ source: cit.source, url: cit.url }),
        url: cit.url,
      };
    });
    return {
      claimId,
      claimText: c.claimText,
      confidence: c.confidence,
      sources,
      supportsClaimIds: [claimId],
    };
  });
}

/* ------------------------------- Builder ---------------------------------- */

export function buildExportDecisionPack(
  report: FeasibilityReport,
  inputs: ConceptInputs,
  options?: { versionFamily?: VersionFamilyEntry[] },
): ExportDecisionPack {
  const fin = report.financials;
  const currency = fin.currency || "";

  // Verdict
  const verdictRaw = (report.decision?.verdict || report.scores.verdict || "").toString();
  const canonical = canonicalizeVerdict(verdictRaw);

  // Score / confidence
  const rawConf = report.decision?.overallConfidencePct ?? null;
  const normalizedConf = confidencePercent(rawConf);

  const confLabel: CanonicalScore["confidenceLabel"] =
    normalizedConf == null ? "Unknown"
    : normalizedConf >= 75 ? "High"
    : normalizedConf >= 50 ? "Medium"
    : "Low";

  // Financial — single source of break-even truth
  const beMonth = extractBreakEvenMonth(fin.breakEvenSummary);
  const beDisplay = buildBreakEvenDisplay(fin.breakEvenSummary, beMonth);
  const beRange = (fin.breakEvenSummary || "").trim() || beDisplay;

  const capExMidValue = fin.capExTotal?.mid
    ?? ((fin.capExTotal?.low || 0) + (fin.capExTotal?.high || 0)) / 2;
  const monthlyOpExTotal = (fin.opEx || []).reduce((sum, o) => sum + (o.monthly || 0), 0);
  const initialFundingValue = capExMidValue + monthlyOpExTotal * 6;

  const financial: CanonicalFinancial = {
    currency,
    investmentRange: withCurrencyPrefix(
      compactCurrencyString(fin.investmentRange) || "Requires validation",
      currency,
    ),
    capexMid: capExMidValue > 0 ? compactMoney(capExMidValue, currency) : "Requires validation",
    monthlyOpex: monthlyOpExTotal > 0
      ? `${compactMoney(monthlyOpExTotal, currency)}/mo`
      : "Requires validation",
    initialFundingNeed: initialFundingValue > 0
      ? compactMoney(initialFundingValue, currency)
      : "Requires validation",
    breakEvenMonth: beMonth,
    breakEvenDisplay: beDisplay,
    breakEvenRange: beRange,
    ltvCac: (fin.ltvCacRatio || "").trim() || "—",
  };

  // Market
  const market: CanonicalMarket = {
    currency: report.market.currency || currency,
    tam: compactCurrencyString(report.market.tamValue),
    sam: compactCurrencyString(report.market.samValue),
    som: compactCurrencyString(report.market.somValue),
    cagr: report.market.tamCagr || "",
    growthSeries: report.market.growthChart || [],
  };

  // Risk — single source of truth for High vs Material
  const allRisks = report.risks || [];
  const highRiskCount = allRisks.filter(isHigh).length;
  const materialRiskCount = allRisks.filter(isMaterial).length;
  const topRisks = [...allRisks]
    .sort((a, b) => Number(isHigh(b)) - Number(isHigh(a)))
    .slice(0, 5);

  // Evidence
  const mix = report.evidenceMix || {
    userInputPercent: 0,
    webResearchPercent: 0,
    aiAssumptionPercent: 0,
  };

  // Roadmap — fall back to recommendations / nextSteps splits if not authored.
  const recs = report.recommendations || [];
  const nexts = report.nextSteps || [];
  const roadmap: CanonicalRoadmap = {
    next30: nexts.slice(0, 3),
    days31to60: recs.slice(0, 3),
    days61to90: recs.slice(3, 6),
  };

  return {
    identity: {
      reportId: report.reportId,
      projectName: inputs.projectName || "Untitled",
      industry: inputs.industry || "",
      location: inputs.location || "",
      date: report.dateIssued || new Date().toISOString().slice(0, 10),
    },
    verdict: { canonical, raw: verdictRaw },
    score: {
      overall: report.scores.overall || 0,
      decisionConfidencePct: normalizedConf,
      confidenceLabel: confLabel,
    },
    financial,
    market,
    risk: { highRiskCount, materialRiskCount, topRisks },
    evidence: { mix, topClaims: buildTopClaims(report) },
    roadmap,
    versionFamily: options?.versionFamily,
  };
}

/* ----------------------- Minimal normalized projection -------------------- */

/**
 * Produce a shallow report clone whose verdict, break-even, and investment
 * range are replaced with the canonical display values from the pack.
 * Used by export entry points to align downstream templates without
 * redesigning them.
 */
export function applyCanonicalToReport(
  report: FeasibilityReport,
  pack: ExportDecisionPack,
): FeasibilityReport {
  return {
    ...report,
    scores: {
      ...report.scores,
      // Use canonical label for display. The literal union is widened at runtime;
      // cast is safe because consumers only read this field as a string.
      verdict: pack.verdict.canonical as FeasibilityReport["scores"]["verdict"],
    },
    financials: {
      ...report.financials,
      investmentRange: pack.financial.investmentRange,
      breakEvenSummary: pack.financial.breakEvenDisplay,
    },
    market: {
      ...report.market,
      tamValue: pack.market.tam,
      samValue: pack.market.sam,
      somValue: pack.market.som,
      tamCagr: pack.market.cagr || report.market.tamCagr,
    },
    decision: report.decision
      ? {
          ...report.decision,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          verdict: pack.verdict.canonical as any,
        }
      : report.decision,
  };
}
