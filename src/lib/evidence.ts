// ============================================================
// Consumer Evidence & Improvement Layer — pure helpers
// Used by the dashboard, Decision Room, shared view, and PDF.
// All functions are pure and safe to call on any (old or new)
// FeasibilityReport. Designed never to crash on missing fields.
// ============================================================
import type {
  ConceptInputs, FeasibilityReport,
  InputFieldAssessment, InputStatus,
  ScoreExplanationRow, ClaimEvidenceRow, ReportVersion,
  DecisionVerdict, ConsumerVerdict,
} from "@/types/analysis";
import { confidencePercent, isInternalConcept, isInternalProject } from "@/lib/format";
import { buildCanonicalReport, REPORT_SCHEMA_VERSION } from "../../supabase/functions/_shared/analysis/canonical";
import { SCORING_ENGINE_VERSION } from "../../supabase/functions/_shared/analysis/scoring";
import {
  EVIDENCE_METHOD_LABEL,
  estimateEvidenceComposition,
  normalizeComposition,
} from "../../supabase/functions/_shared/analysis/evidence";

/* ---------------- helpers ---------------- */
const wordCount = (s: string | undefined) => (s || "").trim().split(/\s+/).filter(Boolean).length;
const pickStatus = (wc: number, strong = 25, ok = 10): InputStatus =>
  wc === 0 ? "missing" : wc < ok ? "weak" : wc < strong ? "needs_improvement" : "complete";
const presentStatus = (v: string | undefined): InputStatus =>
  v && v.trim() ? "complete" : "missing";

const STATUS_SCORE: Record<InputStatus, number> = {
  complete: 100, needs_improvement: 65, weak: 35, missing: 0,
};

/**
 * Sanitize internal/QA strings before showing to the consumer.
 * Replaces forbidden developer wording with safe consumer phrasing,
 * never silently deletes whole sentences.
 */
const FORBIDDEN_PATTERNS: Array<[RegExp, string]> = [
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
export const sanitizeForConsumer = (text: string | undefined | null): string => {
  if (!text) return "";
  let out = String(text);
  for (const [re, sub] of FORBIDDEN_PATTERNS) out = out.replace(re, sub);
  return out.replace(/\s{2,}/g, " ").replace(/\s+([.,;:])/g, "$1").trim();
};

/** Read citations from any of the supported report shapes. */
type LegacyEvidenceReport = FeasibilityReport & {
  citations?: unknown[];
  research?: FeasibilityReport["research"] & { sources?: unknown[] };
};

const getCitations = (report: LegacyEvidenceReport): unknown[] => {
  if (!report) return [];
  if (Array.isArray(report.research?.citations)) return report.research.citations;
  if (Array.isArray(report.sources)) return report.sources;
  if (Array.isArray(report.research?.sources)) return report.research.sources;
  if (Array.isArray(report.citations)) return report.citations;
  return [];
};

/** True if a risk row looks "critical/high" across any of its possible fields. */
const riskRecord = (risk: unknown): Record<string, unknown> =>
  risk && typeof risk === "object" ? risk as Record<string, unknown> : {};
const isHighRisk = (risk: unknown): boolean => {
  const rk = riskRecord(risk);
  const vals = [rk.level, rk.severity, rk.impact, rk.riskLevel, rk.priority];
  return vals.some((v) => typeof v === "string" && /^(high|critical|severe)$/i.test(v.trim()));
};
const hasWeakMitigation = (risk: unknown): boolean => {
  const rk = riskRecord(risk);
  const m = String(rk.mitigation || rk.mitigationPlan || "").trim();
  return m.length < 8;
};

/* ---------------- Input Quality ---------------- */
const FIELD_DEFS: Array<{
  key: keyof ConceptInputs; label: string;
  evaluator: (v: string, all: ConceptInputs) => InputStatus;
  impact: string; suggestion: string;
}> = [
  { key: "description", label: "Project description",
    evaluator: (v) => pickStatus(wordCount(v), 40, 15),
    impact: "Drives nearly every dimension. Vague descriptions raise AI assumption ratio.",
    suggestion: "Add the customer problem, the solution, the differentiator, and the geography." },
  { key: "strategicObjectives", label: "Strategic objectives",
    evaluator: (v) => pickStatus(wordCount(v), 25, 8),
    impact: "Sharpens Achievability and Timing scoring.",
    suggestion: "List 3–5 measurable outcomes (revenue, share, time-to-market)." },
  { key: "industry", label: "Industry / market segment",
    evaluator: (v) => presentStatus(v),
    impact: "Required for benchmarks, TAM/SAM, and risk profile.",
    suggestion: "Pick the closest industry from the dropdown." },
  { key: "location", label: "Location / market",
    evaluator: (v) => presentStatus(v),
    impact: "Without geography, regulatory and demand evidence is generic.",
    suggestion: "Add a city or country." },
  { key: "businessModel", label: "Business model",
    evaluator: (v) => presentStatus(v),
    impact: "Anchors the financial model and break-even logic.",
    suggestion: "Choose how value is delivered (SaaS, marketplace, services, infra…)." },
  { key: "revenueModel", label: "Revenue model & pricing",
    evaluator: (v) => presentStatus(v),
    impact: "Weak revenue inputs cap Financial confidence and break-even reliability.",
    suggestion: "Add pricing, expected customer count, payment model, and gross margin." },
  { key: "budgetRange", label: "Budget",
    evaluator: (v) => presentStatus(v),
    impact: "Drives CapEx, runway, and funding-mix realism.",
    suggestion: "Select your closest investable range." },
  { key: "timeline", label: "Timeline",
    evaluator: (v) => presentStatus(v),
    impact: "Required for Timing score and milestone planning.",
    suggestion: "Pick a target window for launch / completion." },
  { key: "competitorUrls", label: "Competitors",
    evaluator: (v) => pickStatus(wordCount(v.replace(/https?:\/\/\S+/g, "x")), 6, 2),
    impact: "Drives competitive edge analysis and reduces AI assumption ratio.",
    suggestion: "Paste 2–4 real competitor URLs, one per line." },
  { key: "knownRisks", label: "Known risks",
    evaluator: (v) => pickStatus(wordCount(v), 25, 8),
    impact: "Without explicit risks, Risk score relies on AI inference.",
    suggestion: "List 3+ risks (regulatory, technical, market, execution)." },
  { key: "regulatoryConsiderations", label: "Compliance",
    evaluator: (v) => pickStatus(wordCount(v), 20, 6),
    impact: "Material to Risk and Timing in regulated industries.",
    suggestion: "Name the regulators, licences, or standards that apply." },
  { key: "founderExperience", label: "Team / founder experience",
    evaluator: (v) => pickStatus(wordCount(v), 20, 6),
    impact: "Improves Achievability and Operational confidence.",
    suggestion: "Add years of experience, prior exits, and domain expertise." },
  { key: "technologyReadiness", label: "Technology readiness",
    evaluator: (v) => presentStatus(v),
    impact: "Calibrates Achievability score.",
    suggestion: "Pick the readiness level closest to your stack." },
  { key: "assumptions", label: "Financial & business assumptions",
    evaluator: (v) => pickStatus(wordCount(v), 25, 8),
    impact: "Reduces AI assumption ratio across financial claims.",
    suggestion: "Quantify CAC, conversion, churn, ACV, gross margin." },
];

export function assessInputQuality(inputs: ConceptInputs): {
  overall: number;
  fields: InputFieldAssessment[];
  missing: string[]; weak: string[]; needsImprovement: string[]; complete: string[];
  contradictions: string[];
} {
  const internal = isInternalConcept(inputs);
  const fields: InputFieldAssessment[] = FIELD_DEFS.map(({ key, label, evaluator, impact, suggestion }) => {
    if (internal && key === "revenueModel") {
      return {
        key,
        label: "Internal value model",
        status: evaluator(String(inputs[key] ?? ""), inputs),
        impact: "Weak benefit inputs cap Financial confidence and payback reliability.",
        suggestion: "Quantify annual labour cost avoided, productivity hours, adoption, and internal payback.",
      };
    }
    if (internal && key === "assumptions") {
      return {
        key,
        label,
        status: evaluator(String(inputs[key] ?? ""), inputs),
        impact,
        suggestion: "Quantify baseline labour cost, hours saved, adoption, recurring OpEx, and payback.",
      };
    }
    return {
      key,
      label,
      status: evaluator(String(inputs[key] ?? ""), inputs),
      impact,
      suggestion,
    };
  });

  const overall = Math.round(
    fields.reduce((sum, f) => sum + STATUS_SCORE[f.status], 0) / fields.length
  );

  // Lightweight contradiction checks
  const contradictions: string[] = [];
  const budgetVeryLow = /< ?\$?50/i.test(inputs.budgetRange || "");
  const timelineVeryShort = /< ?3/i.test(inputs.timeline || "");
  const teamLarge = /> ?100|51/.test(inputs.teamSize || "");
  if (budgetVeryLow && teamLarge) contradictions.push("Budget is very small for a team of this size.");
  if (timelineVeryShort && /capex|infrastructure|construction/i.test(inputs.industry || ""))
    contradictions.push("Timeline looks short for an infrastructure-grade project.");

  const group = (s: InputStatus) => fields.filter((f) => f.status === s).map((f) => f.label);
  return {
    overall, fields,
    missing: group("missing"),
    weak: group("weak"),
    needsImprovement: group("needs_improvement"),
    complete: group("complete"),
    contradictions,
  };
}

/* ---------------- Evidence Mix ---------------- */
export function deriveEvidenceMix(report: FeasibilityReport, inputs: ConceptInputs) {
  const iq = assessInputQuality(inputs);
  const composition = estimateEvidenceComposition({ inputQuality: iq.overall, sources: report.sources ?? [] });
  return {
    userInputPercent: composition.userInputPercent,
    webResearchPercent: composition.citedSourcePercent,
    calculationPercent: composition.calculationPercent,
    aiAssumptionPercent: composition.aiInferencePercent,
    label: "Estimated Evidence Composition",
    method: EVIDENCE_METHOD_LABEL,
  };
}

/* ---------------- Score Explanation ---------------- */
const DIM_LABEL: Record<ScoreExplanationRow["dimension"], string> = {
  financial: "Financial", market: "Market", achievability: "Achievability",
  risk: "Risk", timing: "Timing", operational: "Operational",
};

const POSITIVE_DRIVERS: Record<ScoreExplanationRow["dimension"], (r: FeasibilityReport, i: ConceptInputs) => string[]> = {
  financial: (r, i) => {
    const internal = isInternalProject(r, i);
    const base = r.financials?.scenarios?.find((scenario) => scenario.scenario === "Base Case")
      ?? r.financials?.scenarios?.[0];
    return [
      internal && base?.annualFinancialBenefit != null
        ? `Annual financial benefit calculated at ${r.financials.currency} ${base.annualFinancialBenefit.toLocaleString()}.`
        : !internal && r.financials?.ltvCacRatio
          ? `LTV:CAC reported as ${r.financials.ltvCacRatio}.`
          : "",
      i.revenueModel ? `${internal ? "Internal value" : "Revenue"} model defined (${i.revenueModel}).` : "",
      i.budgetRange ? `Budget range provided (${i.budgetRange}).` : "",
    ].filter(Boolean);
  },
  market: (r, i) => [
    r.market?.tamValue ? `TAM estimated at ${r.market.tamValue}.` : "",
    i.location ? `Geography specified (${i.location}).` : "",
    (r.research?.citations?.length ?? 0) > 4 ? "Multiple public sources support market context." : "",
  ].filter(Boolean),
  achievability: (r, i) => [
    i.technologyReadiness ? `Technology readiness: ${i.technologyReadiness}.` : "",
    i.founderExperience ? "Founder/team experience provided." : "",
  ].filter(Boolean),
  risk: (r, i) => [
    (r.risks?.filter((x) => x.mitigation && x.mitigation.length > 10).length || 0) > 0
      ? "Most risks have an associated mitigation." : "",
    i.regulatoryConsiderations ? "Regulatory context provided." : "",
  ].filter(Boolean),
  timing: (r, i) => [
    i.timeline ? `Timeline specified (${i.timeline}).` : "",
    r.market?.tamCagr ? `Market growing at ${r.market.tamCagr}.` : "",
  ].filter(Boolean),
  operational: (r, i) => [
    i.teamSize ? `Team size specified (${i.teamSize}).` : "",
    i.dependencies ? "Key dependencies identified." : "",
  ].filter(Boolean),
};

const NEGATIVE_DRIVERS: Record<ScoreExplanationRow["dimension"], (r: FeasibilityReport, i: ConceptInputs, iqWeak: string[]) => string[]> = {
  financial: (r, i, weak) => [
    !i.revenueModel ? `${isInternalProject(r, i) ? "Internal value" : "Revenue"} model not specified.` : "",
    weak.includes("Financial & business assumptions") ? "Financial assumptions are thin." : "",
    !i.budgetRange ? "Budget not provided." : "",
  ].filter(Boolean),
  market: (r, i, weak) => [
    !i.location ? "No geography provided." : "",
    (r.research?.citations?.length ?? 0) < 3 ? "Limited public evidence captured." : "",
    weak.includes("Competitors") ? "Few competitors supplied." : "",
  ].filter(Boolean),
  achievability: (_r, i) => [
    !i.technologyReadiness ? "Technology readiness not set." : "",
    !i.founderExperience ? "Team experience not described." : "",
  ].filter(Boolean),
  risk: (r, i) => [
    (r.risks?.filter((x) => !x.mitigation || x.mitigation.length < 8).length || 0) > 0
      ? "One or more risks lack mitigation." : "",
    !i.knownRisks ? "User-supplied risks are missing." : "",
  ].filter(Boolean),
  timing: (_r, i) => [
    !i.timeline ? "Timeline not provided." : "",
  ].filter(Boolean),
  operational: (_r, i) => [
    !i.teamSize ? "Team size not provided." : "",
    !i.dependencies ? "Dependencies not listed." : "",
  ].filter(Boolean),
};

const IMPROVE_ACTIONS: Record<ScoreExplanationRow["dimension"], string[]> = {
  financial: ["Add pricing and expected customer count.", "Quantify CAC, churn, and gross margin.", "Confirm budget range."],
  market: ["Add the target geography and segment.", "Paste 2–4 competitor URLs.", "Cite a recent market sizing source."],
  achievability: ["Select technology readiness.", "Describe team/founder experience and prior wins."],
  risk: ["List 3+ risks with mitigation.", "Document regulatory and compliance constraints."],
  timing: ["Choose a realistic timeline.", "Note any seasonality or policy windows."],
  operational: ["Specify team size and key roles.", "List external dependencies and SLAs."],
};

export function deriveScoreExplanation(report: FeasibilityReport, inputs: ConceptInputs): ScoreExplanationRow[] {
  const iq = assessInputQuality(inputs);
  const allWeak = [...iq.weak, ...iq.missing, ...iq.needsImprovement];
  const internal = isInternalProject(report, inputs);
  return (Object.keys(DIM_LABEL) as ScoreExplanationRow["dimension"][]).map((dim) => {
    const score = Number(report.scores[dim] ?? 0);
    const positives = POSITIVE_DRIVERS[dim](report, inputs);
    const negatives = NEGATIVE_DRIVERS[dim](report, inputs, allWeak);
    const decisionImplication = score >= 8.5
      ? "Strong contribution to the recommendation."
      : score >= 7
      ? "Solid but needs validation before commitment."
      : score >= 5
      ? "Material drag — needs evidence or design changes."
      : "Significant blocker. Address before further investment.";
    return {
      dimension: dim, label: DIM_LABEL[dim], score,
      positiveDrivers: positives.length ? positives : ["No notable positive drivers detected from inputs."],
      negativeDrivers: negatives.length ? negatives : ["No specific issues detected in inputs."],
      missingEvidence: negatives,
      improvementActions: dim === "financial" && internal
        ? [
            "Quantify annual labour cost avoided and productivity benefit.",
            "Validate adoption against a measured operational baseline.",
            "Confirm budget and internal payback assumptions.",
          ]
        : IMPROVE_ACTIONS[dim],
      decisionImplication,
    };
  });
}

/* ---------------- Claim Evidence Map ---------------- */
export function deriveClaimEvidenceMap(report: FeasibilityReport, inputs: ConceptInputs): ClaimEvidenceRow[] {
  const mix = deriveEvidenceMix(report, inputs);
  const internal = isInternalProject(report, inputs);
  const baseScenario = report.financials?.scenarios?.find((scenario) => scenario.scenario === "Base Case")
    ?? report.financials?.scenarios?.[0];
  const internalBenefit = baseScenario?.annualFinancialBenefit != null
    ? `${report.financials.currency} ${baseScenario.annualFinancialBenefit.toLocaleString()}`
    : baseScenario?.annualValueDisplay || "requires validation";
  const adoption = baseScenario?.adoptionRate != null
    ? `${Math.round(baseScenario.adoptionRate * 100)}%`
    : "requires validation";
  const cites = getCitations(report).map((citation) => {
    if (!citation || typeof citation !== "object") return "";
    const row = citation as Record<string, unknown>;
    return String(row.source || row.title || row.url || "");
  }).filter(Boolean);
  const conf = (n: number): ClaimEvidenceRow["confidence"] => n >= 70 ? "High" : n >= 45 ? "Medium" : "Low";

  const rows: ClaimEvidenceRow[] = [
    {
      claimId: "market-growth",
      claimText: `The market has growth potential (${report.market?.tamCagr || "CAGR not stated"}).`,
      reportSection: "Market Analysis",
      userInputPercent: Math.round(mix.userInputPercent * 0.3),
      webResearchPercent: Math.round(mix.webResearchPercent * 1.2),
      aiAssumptionPercent: Math.max(0, 100 - Math.round(mix.userInputPercent * 0.3) - Math.round(mix.webResearchPercent * 1.2)),
      confidence: conf(confidencePercent(report.scores.confidence?.market) ?? 50),
      sources: cites.slice(0, 3),
      userCanImproveBy: "Add a recent market-sizing source or analyst report.",
    },
    {
      claimId: "break-even",
      claimText: `${internal ? "Internal payback" : "Break-even"} projected: ${report.financials?.breakEvenSummary || "not stated"}.`,
      reportSection: "Financial Plan",
      userInputPercent: Math.round(mix.userInputPercent * 1.3),
      webResearchPercent: Math.round(mix.webResearchPercent * 0.2),
      aiAssumptionPercent: Math.max(0, 100 - Math.round(mix.userInputPercent * 1.3) - Math.round(mix.webResearchPercent * 0.2)),
      confidence: conf(confidencePercent(report.scores.confidence?.financial) ?? 50),
      sources: [],
      userCanImproveBy: internal
        ? "Add measured labour-cost, productivity, adoption, and recurring-cost inputs."
        : "Add pricing, expected customers, churn, and gross margin.",
    },
    internal ? {
      claimId: "internal-financial-outcome",
      claimText: `Base-case annual financial benefit is ${internalBenefit} at ${adoption} adoption.`,
      reportSection: "Financial Plan",
      userInputPercent: Math.round(mix.userInputPercent * 0.9),
      webResearchPercent: Math.round(mix.webResearchPercent * 0.4),
      aiAssumptionPercent: Math.max(0, 100 - Math.round(mix.userInputPercent * 0.9) - Math.round(mix.webResearchPercent * 0.4)),
      confidence: conf(confidencePercent(report.scores.confidence?.financial) ?? 50),
      sources: [],
      userCanImproveBy: "Provide a measured operating baseline and pilot adoption results.",
    } : {
      claimId: "cac",
      claimText: `Customer acquisition economics appear ${report.financials?.ltvCacRatio ? `viable (LTV:CAC ${report.financials.ltvCacRatio})` : "uncertain"}.`,
      reportSection: "Financial Plan",
      userInputPercent: Math.round(mix.userInputPercent * 0.9),
      webResearchPercent: Math.round(mix.webResearchPercent * 0.4),
      aiAssumptionPercent: Math.max(0, 100 - Math.round(mix.userInputPercent * 0.9) - Math.round(mix.webResearchPercent * 0.4)),
      confidence: conf(confidencePercent(report.scores.confidence?.financial) ?? 50),
      sources: [],
      userCanImproveBy: "Provide channel CAC benchmarks or pilot data.",
    },
    {
      claimId: "competition",
      claimText: `Competition appears ${(report.competitors?.length || 0) >= 4 ? "moderate to strong" : "limited / poorly mapped"}.`,
      reportSection: "Competitive Landscape",
      userInputPercent: Math.round(mix.userInputPercent * 0.6 + ((inputs.competitorUrls || "").split(/\s+/).filter(Boolean).length * 6)),
      webResearchPercent: Math.round(mix.webResearchPercent * 0.9),
      aiAssumptionPercent: 0,
      confidence: conf(confidencePercent(report.scores.confidence?.market) ?? 50),
      sources: cites.slice(0, 2),
      userCanImproveBy: "Paste 2–4 competitor URLs and note their pricing or positioning.",
    },
    {
      claimId: "regulatory",
      claimText: `Regulatory risk assessed as ${report.risks?.find((r) => /regulat|complian/i.test(r.name))?.level || "medium"}.`,
      reportSection: "Risk Assessment",
      userInputPercent: inputs.regulatoryConsiderations ? 55 : 15,
      webResearchPercent: 20,
      aiAssumptionPercent: 0,
      confidence: conf(confidencePercent(report.scores.confidence?.risk) ?? 50),
      sources: [],
      userCanImproveBy: "List the specific regulators, licences, or standards.",
    },
  ].map((r) => {
    // Compatibility claims do not have stable claim-to-source IDs. Never
    // present report-level citations as direct support for these claims.
    const composition = normalizeComposition({
      userInputPercent: r.userInputPercent,
      citedSourcePercent: 0,
      calculationPercent: 0,
      aiInferencePercent: r.aiAssumptionPercent + r.webResearchPercent,
    });
    const provenance = composition.userInputPercent >= 95
      ? "User input" as const
      : composition.aiInferencePercent >= composition.userInputPercent
        ? "AI inference" as const
        : "Mixed" as const;
    return {
      ...r,
      userInputPercent: composition.userInputPercent,
      webResearchPercent: 0,
      calculationPercent: composition.calculationPercent,
      aiAssumptionPercent: composition.aiInferencePercent,
      sources: [],
      provenance,
      supportingSourceIds: [],
      conflictingSourceIds: [],
      supportStatus: provenance === "AI inference" ? "ai_inference" as const : "unsupported" as const,
      displayStatus: provenance === "AI inference"
        ? "AI-estimated assumption — not externally verified"
        : "Requires validation",
    };
  });
  return rows;
}

/* ---------------- Verdict / Recommendation ---------------- */
export function computeVerdict(args: {
  score: number;
  overallConfidencePct: number;
  inputQuality: number;
  aiAssumptionPct: number;
  marketEvidenceWeak: boolean;
  financialsMissing: boolean;
  criticalRisksWithoutMitigation: boolean;
  projectType?: "commercial" | "internal";
}): DecisionVerdict {
  const blockers: string[] = [];
  let verdict: ConsumerVerdict = "PROCEED";

  if (args.score >= 8.5 && args.overallConfidencePct >= 70 && !args.criticalRisksWithoutMitigation) {
    verdict = "PROCEED";
  } else if (args.score >= 7.0) {
    verdict = args.overallConfidencePct >= 70 ? "CONDITIONAL PROCEED" : "CONDITIONAL PROCEED WITH VALIDATION";
  } else if (args.score >= 5.5) {
    verdict = "REVISE";
  } else {
    verdict = "DO NOT PROCEED";
  }

  if (args.inputQuality < 60) {
    verdict = "IMPROVE INPUTS BEFORE INVESTMENT DECISION";
    blockers.push("Input quality is below 60% — strengthen the brief before relying on these numbers.");
  }
  if (args.overallConfidencePct < 50 && (verdict === "PROCEED" || verdict === "CONDITIONAL PROCEED")) {
    verdict = "CONDITIONAL PROCEED WITH VALIDATION";
    blockers.push("Analysis confidence is below 50% — validation required before any commitment.");
  }
  if (args.criticalRisksWithoutMitigation) {
    // Never show Proceed when a critical/high risk lacks mitigation.
    if (verdict === "PROCEED" || verdict === "CONDITIONAL PROCEED") {
      verdict = "CONDITIONAL PROCEED WITH VALIDATION";
    }
    blockers.push("Critical/high risk has no mitigation. Address before proceeding.");
  }

  let nextStepHint = "Refine assumptions and validate with stakeholders.";
  if (args.marketEvidenceWeak) nextStepHint = "Validate market demand (customer interviews, sizing sources) before any launch decision.";
  if (args.financialsMissing) {
    nextStepHint = args.projectType === "internal"
      ? "Complete financial validation (cost avoidance, productivity benefit, adoption, recurring cost, and payback) before execution."
      : "Complete financial validation (pricing, CAC, churn, gross margin, and break-even) before execution.";
  }

  let recommendationLabel = verdict.charAt(0) + verdict.slice(1).toLowerCase();
  if (args.aiAssumptionPct > 40 && !/Needs validation/i.test(recommendationLabel)) {
    recommendationLabel += " · Needs validation";
  }
  if (args.criticalRisksWithoutMitigation && !/Needs validation/i.test(recommendationLabel)) {
    recommendationLabel += " · Needs validation";
  }

  return {
    verdict, recommendationLabel, nextStepHint, blockers,
    overallConfidencePct: args.overallConfidencePct,
  };
}

/* ---------------- Ensure / enrich ---------------- */
export function ensureEvidenceFields(report: FeasibilityReport, inputs: ConceptInputs): FeasibilityReport {
  if (!report || !inputs) return report;
  if (
    report.reportSchemaVersion === REPORT_SCHEMA_VERSION
    && report.qualityMetadata?.scoringEngineVersion === SCORING_ENGINE_VERSION
    && report.scoringAudit
  ) {
    return report.inputFieldAssessments
      ? report
      : { ...report, inputFieldAssessments: assessInputQuality(inputs).fields };
  }
  try {
    const canonical = buildCanonicalReport(report, inputs, {
      modelId: report.qualityMetadata?.modelId || "legacy-unrecorded-model",
      promptVersion: report.qualityMetadata?.promptVersion || "legacy-unrecorded-prompt",
      inputHash: report.qualityMetadata?.inputHash || `legacy:${report.reportId}`,
      generationTimestamp: report.qualityMetadata?.generationTimestamp || new Date().toISOString(),
      researchTimestamp: report.qualityMetadata?.researchTimestamp,
    });
    canonical.legacyEvidence = true;
    canonical.inputFieldAssessments = assessInputQuality(inputs).fields;
    canonical.executiveSummary = sanitizeForConsumer(canonical.executiveSummary);
    if (canonical.research) {
      canonical.research = { ...canonical.research, overview: sanitizeForConsumer(canonical.research.overview) };
    }
    return canonical;
  } catch {
    // Older malformed reports remain readable; the compatibility layer below
    // adds safe labels without discarding the stored record.
  }
  const r = { ...report };
  let derived = false;

  if (!r.inputCompleteness || r.inputQualityScore == null) {
    const iq = assessInputQuality(inputs);
    r.inputFieldAssessments = iq.fields;
    r.inputQualityScore = iq.overall;
    r.inputCompleteness = {
      overall: iq.overall,
      missingFields: iq.missing,
      weakFields: [...iq.weak, ...iq.needsImprovement],
      contradictoryFields: iq.contradictions,
    };
    derived = true;
  }
  if (!r.inputFieldAssessments) r.inputFieldAssessments = assessInputQuality(inputs).fields;
  if (!r.evidenceMix) { r.evidenceMix = deriveEvidenceMix(r, inputs); derived = true; }
  if (!r.scoreExplanation || r.scoreExplanation.length === 0) {
    r.scoreExplanation = deriveScoreExplanation(r, inputs); derived = true;
  }
  if (!r.claimEvidenceMap || r.claimEvidenceMap.length === 0) {
    r.claimEvidenceMap = deriveClaimEvidenceMap(r, inputs); derived = true;
  }

  const confAvg = r.scores.confidence
    ? Object.values(r.scores.confidence).reduce((a, b) => a + (Number(b) || 0), 0) / 6
    : 50;
  const overallConfPct = Math.max(0, Math.min(100, confidencePercent(confAvg) ?? 50));
  const marketEvidenceWeak = getCitations(r).length < 3 || (r.scores.market ?? 0) < 6;
  const assumptionsThin = !(inputs.assumptions && inputs.assumptions.trim().split(/\s+/).length >= 8);
  const internal = isInternalProject(r, inputs);
  const baseScenario = r.financials?.scenarios?.find((scenario) => scenario.scenario === "Base Case")
    ?? r.financials?.scenarios?.[0];
  const hasInternalBenefit = baseScenario != null && (
    (baseScenario.annualFinancialBenefit != null && baseScenario.annualFinancialBenefit >= 0)
    || Boolean(baseScenario.annualValueDisplay)
  );
  const financialsMissing =
    !inputs.revenueModel ||
    !inputs.budgetRange ||
    assumptionsThin ||
    !r.financials?.breakEvenSummary ||
    (internal ? !hasInternalBenefit : !r.financials?.ltvCacRatio) ||
    (r.scores.financial ?? 0) < 5;
  const criticalRisksWithoutMitigation = (r.risks || []).some(
    (risk) => isHighRisk(risk) && hasWeakMitigation(risk),
  );

  if (!r.decision) {
    r.decision = computeVerdict({
      score: r.scores.overall ?? 0,
      overallConfidencePct: overallConfPct,
      inputQuality: r.inputQualityScore ?? 0,
      aiAssumptionPct: r.evidenceMix?.aiAssumptionPercent ?? 0,
      marketEvidenceWeak, financialsMissing, criticalRisksWithoutMitigation,
      projectType: internal ? "internal" : "commercial",
    });
    derived = true;
  }

  // Sanitize narrative text
  r.executiveSummary = sanitizeForConsumer(r.executiveSummary);
  if (r.research) r.research = { ...r.research, overview: sanitizeForConsumer(r.research.overview) };

  if (derived) r.legacyEvidence = !(report.scoreExplanation && report.claimEvidenceMap);
  return r;
}

/* ---------------- Assumption Register ---------------- */
export type AssumptionSourceType =
  | "User input" | "Web research" | "AI assumption" | "Mixed" | "Needs validation";

export interface AssumptionRow {
  assumption: string;
  section: string;
  sourceType: AssumptionSourceType;
  evidenceBasis: string;
  confidence: "High" | "Medium" | "Low";
  riskIfWrong: string;
  howToValidate: string;
  whatToAdd: string;
  expectedImpact: string;
}

const presentTrim = (v: string | undefined) => (v || "").trim();
const hasText = (v: string | undefined, min = 6) => presentTrim(v).length >= min;

export function deriveAssumptionRegister(
  report: FeasibilityReport, inputs: ConceptInputs,
): AssumptionRow[] {
  const rows: AssumptionRow[] = [];
  const internal = isInternalProject(report, inputs);
  const baseScenario = report.financials?.scenarios?.find((scenario) => scenario.scenario === "Base Case")
    ?? report.financials?.scenarios?.[0];
  const cites = getCitations(report);
  const hasCites = cites.length > 0;
  const conf = (n: number | undefined): AssumptionRow["confidence"] =>
    (n ?? 50) >= 70 ? "High" : (n ?? 50) >= 45 ? "Medium" : "Low";
  const mConf = confidencePercent(report.scores.confidence?.market) ?? 50;
  const fConf = confidencePercent(report.scores.confidence?.financial) ?? 50;
  const rConf = confidencePercent(report.scores.confidence?.risk) ?? 50;
  const oConf = confidencePercent(report.scores.confidence?.operational) ?? 50;
  const tConf = confidencePercent(report.scores.confidence?.timing) ?? 50;

  // ---- Market ----
  if (report.market?.tamValue) {
    rows.push({
      assumption: `Total addressable market is approximately ${report.market.tamValue}.`,
      section: "Market Analysis",
      sourceType: hasCites ? "Mixed" : "AI assumption",
      evidenceBasis: hasCites
        ? "Derived from public market signals and AI inference."
        : "Inferred by AI from industry and location.",
      confidence: conf(mConf),
      riskIfWrong: "Over- or under-stating opportunity changes investment thesis.",
      howToValidate: "Cross-check with an analyst report or government statistics.",
      whatToAdd: "Cite a recent market-sizing source for your geography and segment.",
      expectedImpact: "Raises Market confidence and reduces AI assumption ratio.",
    });
  }
  if (report.market?.tamCagr) {
    rows.push({
      assumption: `Market is growing at ${report.market.tamCagr} CAGR.`,
      section: "Market Analysis",
      sourceType: hasCites ? "Web research" : "AI assumption",
      evidenceBasis: hasCites ? "Public sources captured during research." : "AI-inferred from industry norms.",
      confidence: conf(mConf),
      riskIfWrong: "Growth shortfall delays break-even and erodes returns.",
      howToValidate: "Compare with 2+ independent forecasts.",
      whatToAdd: "Add a credible CAGR source (analyst note, regulator, trade body).",
      expectedImpact: "Improves Market and Timing confidence.",
    });
  }
  rows.push({
    assumption: internal
      ? "Priority departments will adopt the platform as described in the brief."
      : "Target customer demand exists as described in the brief.",
    section: "Customer Profile",
    sourceType: hasText(inputs.description, 60) ? "Mixed" : "AI assumption",
    evidenceBasis: hasText(inputs.description, 60)
      ? "Based on the brief, with AI generalisation where details are thin."
      : "Largely AI-inferred from category norms.",
    confidence: conf(mConf),
    riskIfWrong: internal ? "Weak adoption reduces realized cost avoidance and delays payback." : "Weak demand collapses revenue forecasts.",
    howToValidate: internal ? "Run a time-boxed pilot with priority departments." : "Run 8–15 customer interviews or a paid pilot.",
    whatToAdd: internal ? "Add process baselines, stakeholder sign-off, and pilot adoption results." : "Add customer interview notes, survey data, or pilot results.",
    expectedImpact: "Strongest single improvement to Market confidence.",
  });
  rows.push({
    assumption: internal
      ? "The measured operational benefit justifies the internal investment."
      : "Customers are willing to pay at the modeled price point.",
    section: "Customer Profile",
    sourceType: hasText(inputs.revenueModel, 8) ? "Mixed" : "Needs validation",
    evidenceBasis: hasText(inputs.revenueModel, 8)
      ? `Anchored to the ${internal ? "internal value" : "revenue"} model you provided.`
      : "Not directly supported by input or research.",
    confidence: conf(fConf),
    riskIfWrong: internal ? "Overstated savings make the investment case uneconomic." : "Price/value mismatch breaks unit economics.",
    howToValidate: internal ? "Validate labour rates, hours saved, avoidable spend, and adoption with finance and operations." : "Run pricing tests or willingness-to-pay surveys.",
    whatToAdd: internal ? "Add baseline process cost, benefit ownership, and pilot measurements." : "Add actual pricing tiers, contract sizes, or pilot pricing data.",
    expectedImpact: `Improves Financial confidence and ${internal ? "payback" : "break-even"} reliability.`,
  });
  rows.push({
    assumption: `Competitive intensity is ${(report.competitors?.length || 0) >= 4 ? "moderate to strong" : "limited or weakly mapped"}.`,
    section: "Competitive Landscape",
    sourceType: presentTrim(inputs.competitorUrls) ? "Mixed" : "AI assumption",
    evidenceBasis: presentTrim(inputs.competitorUrls)
      ? "Based on the URLs you provided plus AI inference."
      : "AI-inferred — no competitor URLs supplied.",
    confidence: conf(mConf),
    riskIfWrong: internal ? "Mis-reading alternatives leads to weak adoption or duplicated tooling." : "Mis-reading competition leads to wrong positioning and CAC.",
    howToValidate: "Build a side-by-side feature/price matrix of 3–5 competitors.",
    whatToAdd: "Paste 2–4 competitor URLs and note their pricing and positioning.",
    expectedImpact: "Sharpens Market score and lowers AI assumption ratio.",
  });

  // ---- Financial ----
  if (internal) {
    const adoption = baseScenario?.adoptionRate != null
      ? `${Math.round(baseScenario.adoptionRate * 100)}%`
      : "requires validation";
    const financialBenefit = baseScenario?.annualFinancialBenefit != null
      ? `${report.financials.currency} ${baseScenario.annualFinancialBenefit.toLocaleString()}`
      : baseScenario?.annualValueDisplay || "requires validation";
    rows.push({
      assumption: `Base-case adoption reaches ${adoption}.`,
      section: "Financial Plan",
      sourceType: hasText(inputs.assumptions, 25) ? "Mixed" : "Needs validation",
      evidenceBasis: hasText(inputs.assumptions, 25) ? "Partly grounded in your stated assumptions." : "Not supported by measured pilot data.",
      confidence: conf(fConf),
      riskIfWrong: "Lower adoption reduces realized cost avoidance and delays payback.",
      howToValidate: "Run a pilot and track active use by eligible staff or departments.",
      whatToAdd: "Add eligible-user count, adoption ramp, and sustained-use targets.",
      expectedImpact: "Materially improves Financial confidence.",
    });
    rows.push({
      assumption: `Base-case annual cost avoidance and productivity benefit totals ${financialBenefit}.`,
      section: "Financial Plan",
      sourceType: hasText(inputs.assumptions, 25) ? "Mixed" : "AI assumption",
      evidenceBasis: hasText(inputs.assumptions, 25) ? "Calculated from the stated internal value assumptions." : "AI-estimated assumption — not externally verified.",
      confidence: conf(fConf),
      riskIfWrong: "Overstated hours or labour rates invalidate the internal value case.",
      howToValidate: "Measure the current process baseline, loaded labour rate, and avoidable spend.",
      whatToAdd: "Add baseline hours, loaded labour cost, productivity conversion rate, and benefit owner.",
      expectedImpact: "Improves Financial confidence and benefit realism.",
    });
    rows.push({
      assumption: "Recurring platform cost remains within the modeled OpEx envelope.",
      section: "Financial Plan",
      sourceType: hasText(inputs.budgetRange) ? "Mixed" : "AI assumption",
      evidenceBasis: "Calculated from current OpEx line items; vendor quotes still require validation.",
      confidence: conf(fConf),
      riskIfWrong: "Higher recurring cost reduces net operational benefit and extends payback.",
      howToValidate: "Confirm licensing, support, hosting, and change-management costs with owners.",
      whatToAdd: "Add vendor quotes and a three-year internal operating-cost forecast.",
      expectedImpact: "Improves payback and funding confidence.",
    });
  } else {
    rows.push({
      assumption: "Customer acquisition cost (CAC) is within a healthy range.",
      section: "Financial Plan",
      sourceType: hasText(inputs.assumptions, 25) ? "Mixed" : "Needs validation",
      evidenceBasis: hasText(inputs.assumptions, 25)
        ? "Partly grounded in your stated assumptions."
        : "Not supported by direct input — based on category norms.",
      confidence: conf(fConf),
      riskIfWrong: "Higher CAC erodes margin and pushes break-even out.",
      howToValidate: "Run a small paid pilot or use industry CAC benchmarks.",
      whatToAdd: "Add channel CAC benchmarks or pilot acquisition data.",
      expectedImpact: "Materially improves Financial confidence.",
    });
    rows.push({
      assumption: "Churn / retention is acceptable for the modeled LTV.",
      section: "Financial Plan",
      sourceType: "AI assumption",
      evidenceBasis: "Not supplied — estimated from category norms.",
      confidence: conf(fConf - 10),
      riskIfWrong: "High churn collapses LTV and turns LTV:CAC negative.",
      howToValidate: "Track cohort retention for at least 90 days post-launch.",
      whatToAdd: "Add expected monthly logo churn and revenue churn assumptions.",
      expectedImpact: "Improves Financial confidence and revenue scenario realism.",
    });
    rows.push({
      assumption: "Gross margin supports the financial scenarios.",
      section: "Financial Plan",
      sourceType: hasText(inputs.assumptions, 25) ? "Mixed" : "AI assumption",
      evidenceBasis: hasText(inputs.assumptions, 25) ? "Inferred from your assumptions." : "AI-inferred from business model.",
      confidence: conf(fConf),
      riskIfWrong: "Margin compression invalidates break-even analysis.",
      howToValidate: "Build a bottoms-up COGS model with supplier quotes.",
      whatToAdd: "Add target gross margin % and key COGS line items.",
      expectedImpact: "Improves Financial confidence and funding-mix realism.",
    });
  }
  if (report.financials?.breakEvenSummary) {
    rows.push({
      assumption: `${internal ? "Internal payback" : "Break-even"} occurs around ${report.financials.breakEvenSummary}.`,
      section: "Financial Plan",
      sourceType: hasText(inputs.budgetRange) && hasText(inputs.revenueModel) ? "Mixed" : "AI assumption",
      evidenceBasis: `Derived from budget, ${internal ? "benefit" : "revenue"} model, and current projections.`,
      confidence: conf(fConf),
      riskIfWrong: internal ? "Misses internal payback expectations and funding sizing." : "Misses runway requirements and funding sizing.",
      howToValidate: internal ? "Build a monthly benefit-realization model with conservative adoption." : "Build a monthly cash-flow model with pessimistic scenarios.",
      whatToAdd: internal ? "Add benefit timing, adoption ramp, and OpEx detail." : "Add pricing, customer ramp, and OpEx detail.",
      expectedImpact: "Reduces runway risk and improves funding plan.",
    });
  }
  if (report.financials?.capExTotal?.mid) {
    rows.push({
      assumption: `CapEx mid-estimate is ${report.financials.currency} ${report.financials.capExTotal.mid.toLocaleString()}.`,
      section: "Financial Plan",
      sourceType: hasText(inputs.budgetRange) ? "Mixed" : "AI assumption",
      evidenceBasis: "Estimated from category norms and your budget signal.",
      confidence: conf(fConf),
      riskIfWrong: "Under-budgeting CapEx delays go-live or blows the plan.",
      howToValidate: "Get 2–3 vendor quotes for major line items.",
      whatToAdd: "Add supplier/vendor quotes or comparable past projects.",
      expectedImpact: "Tightens CapEx range and Financial confidence.",
    });
  }
  if (!internal && report.financials?.ltvCacRatio) {
    rows.push({
      assumption: `LTV:CAC of ${report.financials.ltvCacRatio} is achievable.`,
      section: "Financial Plan",
      sourceType: "Mixed",
      evidenceBasis: "Computed from pricing, retention, and CAC assumptions.",
      confidence: conf(fConf),
      riskIfWrong: "Negative unit economics make growth unfundable.",
      howToValidate: "Validate each input (price, retention, CAC) independently.",
      whatToAdd: "Add real cohort data once available.",
      expectedImpact: "Strongly improves Financial confidence.",
    });
  }

  // ---- Operational ----
  rows.push({
    assumption: `The team can deliver within the proposed timeline.`,
    section: "Operational Readiness",
    sourceType: hasText(inputs.founderExperience, 20) && presentTrim(inputs.teamSize) ? "User input" : "AI assumption",
    evidenceBasis: hasText(inputs.founderExperience, 20) ? "Based on the team detail you provided." : "AI-inferred from team-size proxies.",
    confidence: conf(oConf),
    riskIfWrong: internal ? "Delivery slip delays operational benefit and extends payback." : "Delivery slip pushes out revenue and burns runway.",
    howToValidate: "Stress-test the plan with an experienced delivery lead.",
    whatToAdd: "Add key roles, prior wins, and a high-level delivery plan.",
    expectedImpact: "Improves Achievability and Operational confidence.",
  });
  rows.push({
    assumption: `Technology readiness (${presentTrim(inputs.technologyReadiness) || "not specified"}) is sufficient for launch.`,
    section: "Operational Readiness",
    sourceType: presentTrim(inputs.technologyReadiness) ? "User input" : "Needs validation",
    evidenceBasis: presentTrim(inputs.technologyReadiness) ? "Selected during intake." : "Not provided — assumed mature.",
    confidence: conf(oConf),
    riskIfWrong: "Immature tech adds R&D risk and timeline slip.",
    howToValidate: "Run a technical spike or proof-of-concept.",
    whatToAdd: "Add architecture overview and key technology choices.",
    expectedImpact: "Improves Achievability confidence.",
  });
  rows.push({
    assumption: `Critical dependencies and vendors will be available on time.`,
    section: "Operational Readiness",
    sourceType: hasText(inputs.dependencies, 12) ? "User input" : "AI assumption",
    evidenceBasis: hasText(inputs.dependencies, 12) ? "From the dependencies you listed." : "AI-inferred — none listed.",
    confidence: conf(oConf - 5),
    riskIfWrong: "Single-vendor failure can stall the entire plan.",
    howToValidate: "Confirm SLAs and identify backup providers.",
    whatToAdd: "List external dependencies with status and SLA.",
    expectedImpact: "Improves Operational and Timing confidence.",
  });
  if (presentTrim(inputs.timeline)) {
    rows.push({
      assumption: `Launch timeline (${inputs.timeline}) is realistic.`,
      section: "Timing",
      sourceType: "User input",
      evidenceBasis: "Selected during intake.",
      confidence: conf(tConf),
      riskIfWrong: "Missed window can favour competitors or close the opportunity.",
      howToValidate: "Build a milestone plan with critical-path analysis.",
      whatToAdd: "Add milestone dates and dependency map.",
      expectedImpact: "Improves Timing confidence.",
    });
  }

  // ---- Risk & compliance ----
  const regRisk = report.risks?.find((r) => /regulat|complian|legal/i.test(r.name));
  rows.push({
    assumption: `Regulatory complexity is ${regRisk?.level || "manageable"}.`,
    section: "Risk Assessment",
    sourceType: presentTrim(inputs.regulatoryConsiderations) ? "Mixed" : "AI assumption",
    evidenceBasis: presentTrim(inputs.regulatoryConsiderations)
      ? "Anchored to your regulatory notes." : "AI-inferred — no compliance detail supplied.",
    confidence: conf(rConf),
    riskIfWrong: "Unanticipated licensing or compliance work delays launch.",
    howToValidate: "Engage a local legal/compliance advisor early.",
    whatToAdd: "Name the regulators, licences, or standards that apply.",
    expectedImpact: "Reduces Risk and Timing surprises.",
  });
  const weakMitigation = (report.risks || []).some((risk) => isHighRisk(risk) && hasWeakMitigation(risk));
  rows.push({
    assumption: `Risk mitigations are effective enough to keep risks at the stated levels.`,
    section: "Risk Assessment",
    sourceType: weakMitigation ? "Needs validation" : "Mixed",
    evidenceBasis: weakMitigation
      ? "At least one high risk has no mitigation."
      : "Each material risk has a mitigation noted.",
    confidence: weakMitigation ? "Low" : conf(rConf),
    riskIfWrong: "A high risk with weak mitigation can sink the plan.",
    howToValidate: "Pressure-test mitigations with an independent risk reviewer.",
    whatToAdd: "Add concrete mitigation owners, triggers, and contingency budget.",
    expectedImpact: "Improves Risk score and overall confidence.",
  });
  rows.push({
    assumption: `Security and privacy obligations can be met within plan.`,
    section: "Risk Assessment",
    sourceType: presentTrim(inputs.regulatoryConsiderations) ? "Mixed" : "AI assumption",
    evidenceBasis: presentTrim(inputs.regulatoryConsiderations)
      ? "Partly anchored to regulatory notes."
      : "Inferred — no security/privacy detail supplied.",
    confidence: conf(rConf - 5),
    riskIfWrong: "Security incidents trigger fines and reputational damage.",
    howToValidate: "Run a lightweight threat model and gap-assess against the relevant standard.",
    whatToAdd: "Add applicable data classifications and security controls.",
    expectedImpact: "Improves Risk confidence.",
  });

  // Cap to 15 and sanitize text fields for safety
  return rows.slice(0, 15).map((r) => ({
    ...r,
    assumption: sanitizeForConsumer(r.assumption),
    evidenceBasis: sanitizeForConsumer(r.evidenceBasis),
    riskIfWrong: sanitizeForConsumer(r.riskIfWrong),
    howToValidate: sanitizeForConsumer(r.howToValidate),
    whatToAdd: sanitizeForConsumer(r.whatToAdd),
    expectedImpact: sanitizeForConsumer(r.expectedImpact),
  }));
}

/* ---------------- Versioning ---------------- */
export function buildVersionEntry(
  previous: FeasibilityReport, next: FeasibilityReport,
  prevInputs: ConceptInputs, nextInputs: ConceptInputs,
): ReportVersion {
  const changed: string[] = [];
  for (const k of Object.keys(nextInputs) as (keyof ConceptInputs)[]) {
    if (prevInputs[k] !== nextInputs[k]) changed.push(String(k));
  }
  const prevConfAvg = previous.scores.confidence
    ? Object.values(previous.scores.confidence).reduce((a, b) => a + (Number(b) || 0), 0) / 6 : 50;
  const nextConfAvg = next.scores.confidence
    ? Object.values(next.scores.confidence).reduce((a, b) => a + (Number(b) || 0), 0) / 6 : 50;
  const prevConfPct = confidencePercent(prevConfAvg) ?? 50;
  const nextConfPct = confidencePercent(nextConfAvg) ?? 50;
  const prevAi = previous.evidenceMix?.aiAssumptionPercent ?? 0;
  const nextAi = next.evidenceMix?.aiAssumptionPercent ?? 0;

  const summaryParts: string[] = [];
  if (changed.length) summaryParts.push(`Updated ${changed.length} field${changed.length === 1 ? "" : "s"}.`);
  if (nextConfPct > prevConfPct + 2) summaryParts.push("Model-estimated confidence improved.");
  else if (nextConfPct < prevConfPct - 2) summaryParts.push("Model-estimated confidence dropped — new information revealed weaknesses.");
  if (nextAi < prevAi - 3) summaryParts.push("AI assumption ratio decreased.");
  if (!summaryParts.length) summaryParts.push("Re-run produced minor changes.");

  return {
    versionId: `v${Date.now()}`,
    createdAt: new Date().toISOString(),
    changedInputs: changed,
    previousScore: previous.scores.overall ?? 0,
    newScore: next.scores.overall ?? 0,
    scoreDelta: Number(((next.scores.overall ?? 0) - (previous.scores.overall ?? 0)).toFixed(2)),
    previousConfidence: prevConfPct,
    newConfidence: nextConfPct,
    confidenceDelta: nextConfPct - prevConfPct,
    previousAiAssumptionPercent: prevAi,
    newAiAssumptionPercent: nextAi,
    summary: summaryParts.join(" "),
  };
}
