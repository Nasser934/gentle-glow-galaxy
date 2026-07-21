// =============================================================================
// Canonical Export Decision Pack
// -----------------------------------------------------------------------------
// One shared normalized data model used by PDF, PowerPoint, and Excel exports
// so the three formats never disagree on verdict, break-even, financial labels,
// risk counts, or source labels.
//
// Reports reach this module after the canonical server/read-time validator has
// recalculated the score and attached explicit evidence metadata.
// =============================================================================

import type {
  ConceptInputs,
  FeasibilityReport,
  RiskRow,
} from "@/types/analysis";
import {
  compactCurrencyString,
  compactNumber,
  confidencePercent,
  prettifySource,
} from "@/lib/format";
import { extractBreakEvenMonth, formatBreakEvenDisplay } from "@/lib/breakEven";

export { extractBreakEvenMonth } from "@/lib/breakEven";

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
    relationship: "supporting" | "conflicting";
  }>;
  supportsClaimIds: string[];
  supportStatus: "supported" | "conflicting" | "unsupported" | "ai_inference";
  provenance: string;
}

export interface CanonicalEvidence {
  mix: {
    userInputPercent: number;
    webResearchPercent: number;
    calculationPercent?: number;
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

/* ---------------------------- Financial helpers --------------------------- */

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

/* ----------------------------- Market helpers ----------------------------- */

/**
 * Normalize a market value string. If the raw input already contains a
 * compact currency expression (e.g. "$500M 2025 (Forecasted)"), extract
 * only that expression so years/notes don't get compacted (e.g. "2K").
 */
function canonicalMarketValue(raw: string | undefined | null): string {
  const t = (raw || "").toString().trim();
  if (!t) return "Requires validation";
  const compact = t.match(
    /(?:USD|SAR|AED|EUR|GBP|\$|€|£)?\s*\d+(?:\.\d+)?\s*(?:K|M|B|T|million|billion|trillion)\b/i,
  );
  if (compact) return compact[0].replace(/\s+/g, " ").trim();
  return compactCurrencyString(t) || t;
}

const riskLevelText = (risk: RiskRow & { severity?: string }): string =>
  `${risk.severity ?? ""} ${risk.level ?? ""}`.trim();

const isHigh = (r: RiskRow): boolean => /\b(high|critical)\b/i.test(riskLevelText(r));

const isMaterial = (r: RiskRow): boolean =>
  isHigh(r) || /\b(med|medium)\b/i.test(riskLevelText(r));

/* ------------------------------ Evidence ---------------------------------- */

function buildTopClaims(report: FeasibilityReport): CanonicalEvidenceClaim[] {
  const explicitSources = report.sources ?? (report.research?.citations || [])
    .filter((citation) => citation.sourceId)
    .map((citation) => ({
      sourceId: citation.sourceId as string,
      title: citation.title,
      url: citation.url,
      domain: citation.domain || "",
      publisher: citation.publisher || citation.source,
      accessDate: citation.accessDate || "",
      sourceType: citation.sourceType || "general",
      quality: citation.quality || "Unknown" as const,
    }));
  const sourceById = new Map(explicitSources.map((source) => [source.sourceId, source]));
  const claims = report.claims ?? (report.claimEvidenceMap || []).map((claim) => ({
    claimId: claim.claimId,
    claimText: claim.claimText,
    reportSection: claim.reportSection,
    provenance: claim.provenance ?? "Unknown" as const,
    supportingSourceIds: claim.supportingSourceIds ?? [],
    conflictingSourceIds: claim.conflictingSourceIds ?? [],
    composition: {
      userInputPercent: claim.userInputPercent,
      citedSourcePercent: claim.webResearchPercent,
      calculationPercent: claim.calculationPercent ?? 0,
      aiInferencePercent: claim.aiAssumptionPercent,
    },
    supportStatus: claim.supportStatus ?? "unsupported" as const,
    displayStatus: claim.displayStatus,
  }));
  return claims.slice(0, 5).map((claim) => {
    const sources = [
      ...claim.supportingSourceIds.map((sourceId) => ({ sourceId, relationship: "supporting" as const })),
      ...claim.conflictingSourceIds.map((sourceId) => ({ sourceId, relationship: "conflicting" as const })),
    ]
      .map(({ sourceId, relationship }) => ({ source: sourceById.get(sourceId), relationship }))
      .filter((item): item is { source: NonNullable<typeof item.source>; relationship: "supporting" | "conflicting" } => item.source !== undefined)
      .map(({ source, relationship }) => ({
        title: source.title,
        domain: source.domain || prettifySource({ source: source.publisher, url: source.url }),
        url: source.url,
        sourceType: source.sourceType,
        relationship,
      }));
    return {
      claimId: claim.claimId,
      claimText: claim.claimText,
      confidence: claim.supportStatus === "supported" ? "Supported" : claim.supportStatus === "conflicting" ? "Conflicting" : "Requires validation",
      sources,
      supportsClaimIds: claim.supportingSourceIds.length > 0 ? [claim.claimId] : [],
      supportStatus: claim.supportStatus,
      provenance: claim.provenance,
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
  const beDisplay = formatBreakEvenDisplay(fin.breakEvenSummary);
  const beRange = beMonth == null ? beDisplay : (fin.breakEvenSummary || "").trim() || beDisplay;

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
    tam: canonicalMarketValue(report.market.tamValue),
    sam: canonicalMarketValue(report.market.samValue),
    som: canonicalMarketValue(report.market.somValue),
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
    calculationPercent: 0,
    aiAssumptionPercent: 100,
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
