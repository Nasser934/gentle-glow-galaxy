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
import { confidencePercent } from "@/lib/format";

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
const getCitations = (report: any): any[] => {
  if (!report) return [];
  if (Array.isArray(report.research?.citations)) return report.research.citations;
  if (Array.isArray(report.sources)) return report.sources;
  if (Array.isArray(report.research?.sources)) return report.research.sources;
  if (Array.isArray(report.citations)) return report.citations;
  return [];
};

/** True if a risk row looks "critical/high" across any of its possible fields. */
const isHighRisk = (rk: any): boolean => {
  const vals = [rk?.level, rk?.severity, rk?.impact, rk?.riskLevel, rk?.priority];
  return vals.some((v) => typeof v === "string" && /^(high|critical|severe)$/i.test(v.trim()));
};
const hasWeakMitigation = (rk: any): boolean => {
  const m = (rk?.mitigation || rk?.mitigationPlan || "").toString().trim();
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
  const fields: InputFieldAssessment[] = FIELD_DEFS.map(({ key, label, evaluator, impact, suggestion }) => ({
    key, label,
    status: evaluator(String((inputs as any)[key] ?? ""), inputs),
    impact, suggestion,
  }));

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
  const citations = report.research?.citations?.length || 0;
  const confAvg = report.scores.confidence
    ? Object.values(report.scores.confidence).reduce((a, b) => a + (Number(b) || 0), 0) / 6
    : 50;
  const confPct = Math.max(0, Math.min(100, confidencePercent(confAvg) ?? 50));

  // user input contribution scales with input quality
  let userPct = Math.round(iq.overall * 0.45);                    // 0-45
  // web research contribution scales with citation density (cap 50)
  let webPct = Math.round(Math.min(50, citations * 6));           // 0-50
  // AI assumption is the remainder, floored by inverse confidence
  let aiPct = Math.max(0, 100 - userPct - webPct);
  const aiFloor = Math.round(Math.max(10, 100 - confPct));
  if (aiPct < aiFloor) {
    const deficit = aiFloor - aiPct;
    const take = Math.min(deficit, userPct);
    userPct -= take; aiPct += take;
  }
  // normalize tiny rounding drift
  const total = userPct + webPct + aiPct;
  if (total !== 100) webPct += 100 - total;

  return { userInputPercent: userPct, webResearchPercent: webPct, aiAssumptionPercent: aiPct };
}

/* ---------------- Score Explanation ---------------- */
const DIM_LABEL: Record<ScoreExplanationRow["dimension"], string> = {
  financial: "Financial", market: "Market", achievability: "Achievability",
  risk: "Risk", timing: "Timing", operational: "Operational",
};

const POSITIVE_DRIVERS: Record<ScoreExplanationRow["dimension"], (r: FeasibilityReport, i: ConceptInputs) => string[]> = {
  financial: (r, i) => [
    r.financials?.ltvCacRatio ? `LTV:CAC reported as ${r.financials.ltvCacRatio}.` : "",
    i.revenueModel ? `Revenue model defined (${i.revenueModel}).` : "",
    i.budgetRange ? `Budget range provided (${i.budgetRange}).` : "",
  ].filter(Boolean),
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
  financial: (_r, i, weak) => [
    !i.revenueModel ? "Revenue model not specified." : "",
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
  return (Object.keys(DIM_LABEL) as ScoreExplanationRow["dimension"][]).map((dim) => {
    const score = Number((report.scores as any)?.[dim] ?? 0);
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
      improvementActions: IMPROVE_ACTIONS[dim],
      decisionImplication,
    };
  });
}

/* ---------------- Claim Evidence Map ---------------- */
export function deriveClaimEvidenceMap(report: FeasibilityReport, inputs: ConceptInputs): ClaimEvidenceRow[] {
  const mix = deriveEvidenceMix(report, inputs);
  const cites = (report.research?.citations || []).map((c) => c.source || c.title).filter(Boolean) as string[];
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
      claimText: `Break-even projected: ${report.financials?.breakEvenSummary || "not stated"}.`,
      reportSection: "Financial Plan",
      userInputPercent: Math.round(mix.userInputPercent * 1.3),
      webResearchPercent: Math.round(mix.webResearchPercent * 0.2),
      aiAssumptionPercent: Math.max(0, 100 - Math.round(mix.userInputPercent * 1.3) - Math.round(mix.webResearchPercent * 0.2)),
      confidence: conf(confidencePercent(report.scores.confidence?.financial) ?? 50),
      sources: [],
      userCanImproveBy: "Add pricing, expected customers, churn, and gross margin.",
    },
    {
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
    // normalize each row's mix to sum to 100
    const total = r.userInputPercent + r.webResearchPercent + r.aiAssumptionPercent;
    if (total === 0) return { ...r, aiAssumptionPercent: 100 };
    const k = 100 / total;
    const u = Math.round(r.userInputPercent * k);
    const w = Math.round(r.webResearchPercent * k);
    const a = Math.max(0, 100 - u - w);
    return { ...r, userInputPercent: u, webResearchPercent: w, aiAssumptionPercent: a };
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
    if (verdict === "PROCEED") verdict = "CONDITIONAL PROCEED WITH VALIDATION";
    blockers.push("Critical risks have no mitigation. Address before proceeding.");
  }

  let nextStepHint = "Refine assumptions and validate with stakeholders.";
  if (args.marketEvidenceWeak) nextStepHint = "Run market validation (customer interviews, sizing sources) before any launch decision.";
  if (args.financialsMissing) nextStepHint = "Complete financial validation (pricing, CAC, break-even) before execution.";

  let recommendationLabel = verdict.charAt(0) + verdict.slice(1).toLowerCase();
  if (args.aiAssumptionPct > 40) recommendationLabel += " · Needs validation";

  return {
    verdict, recommendationLabel, nextStepHint, blockers,
    overallConfidencePct: args.overallConfidencePct,
  };
}

/* ---------------- Ensure / enrich ---------------- */
export function ensureEvidenceFields(report: FeasibilityReport, inputs: ConceptInputs): FeasibilityReport {
  if (!report || !inputs) return report;
  const r = { ...report };
  let derived = false;

  if (!r.inputCompleteness || r.inputQualityScore == null) {
    const iq = assessInputQuality(inputs);
    r.inputQualityScore = iq.overall;
    r.inputCompleteness = {
      overall: iq.overall,
      missingFields: iq.missing,
      weakFields: [...iq.weak, ...iq.needsImprovement],
      contradictoryFields: iq.contradictions,
    };
    derived = true;
  }
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
  const marketEvidenceWeak = (r.research?.citations?.length ?? 0) < 3 || (r.scores.market ?? 0) < 6;
  const financialsMissing = !inputs.revenueModel || !inputs.budgetRange || (r.scores.financial ?? 0) < 5;
  const criticalRisksWithoutMitigation = (r.risks || []).some(
    (rk) => rk.level === "High" && (!rk.mitigation || rk.mitigation.trim().length < 8)
  );

  if (!r.decision) {
    r.decision = computeVerdict({
      score: r.scores.overall ?? 0,
      overallConfidencePct: overallConfPct,
      inputQuality: r.inputQualityScore ?? 0,
      aiAssumptionPct: r.evidenceMix?.aiAssumptionPercent ?? 0,
      marketEvidenceWeak, financialsMissing, criticalRisksWithoutMitigation,
    });
    derived = true;
  }

  // Sanitize narrative text
  r.executiveSummary = sanitizeForConsumer(r.executiveSummary);
  if (r.research) r.research = { ...r.research, overview: sanitizeForConsumer(r.research.overview) };

  if (derived) r.legacyEvidence = !(report.scoreExplanation && report.claimEvidenceMap);
  return r;
}

/* ---------------- Versioning ---------------- */
export function buildVersionEntry(
  previous: FeasibilityReport, next: FeasibilityReport,
  prevInputs: ConceptInputs, nextInputs: ConceptInputs,
): ReportVersion {
  const changed: string[] = [];
  for (const k of Object.keys(nextInputs) as (keyof ConceptInputs)[]) {
    if ((prevInputs as any)[k] !== (nextInputs as any)[k]) changed.push(String(k));
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
  if (nextConfPct > prevConfPct + 2) summaryParts.push("Confidence improved.");
  else if (nextConfPct < prevConfPct - 2) summaryParts.push("Confidence dropped — new info revealed weaknesses.");
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
