// ============================================================
// Consumer Evidence & Improvement Layer — Deno-safe helpers
// Mirrors src/lib/evidence.ts but with no `@/` aliases, no
// frontend deps, and `any` shapes so it runs in Edge Functions.
// Keep logic in sync with the client copy.
// ============================================================

export type InputStatus = "complete" | "needs_improvement" | "weak" | "missing";

export interface InputFieldAssessment {
  key: string;
  label: string;
  status: InputStatus;
  impact: string;
  suggestion: string;
}

export interface ScoreExplanationRow {
  dimension: "financial" | "market" | "achievability" | "risk" | "timing" | "operational";
  label: string;
  score: number;
  positiveDrivers: string[];
  negativeDrivers: string[];
  missingEvidence: string[];
  improvementActions: string[];
  decisionImplication: string;
}

export interface ClaimEvidenceRow {
  claimId: string;
  claimText: string;
  reportSection: string;
  userInputPercent: number;
  webResearchPercent: number;
  aiAssumptionPercent: number;
  confidence: "High" | "Medium" | "Low";
  sources: string[];
  userCanImproveBy: string;
}

export type ConsumerVerdict =
  | "PROCEED"
  | "CONDITIONAL PROCEED"
  | "CONDITIONAL PROCEED WITH VALIDATION"
  | "IMPROVE INPUTS BEFORE INVESTMENT DECISION"
  | "REVISE"
  | "DO NOT PROCEED";

export interface DecisionVerdict {
  verdict: ConsumerVerdict;
  recommendationLabel: string;
  nextStepHint: string;
  blockers: string[];
  overallConfidencePct: number;
}

/* ---------------- helpers ---------------- */
export function confidencePercent(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "string" && (raw.trim() === "" || /^n\/?a$/i.test(raw.trim()))) return null;
  let n = typeof raw === "string" ? parseFloat(raw.replace(/[%,\s]/g, "")) : Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n < 0) n = 0;
  if (n > 0 && n <= 1) n = n * 100;
  else if (n > 1 && n <= 10) n = n * 10;
  while (n > 100) n = n / 10;
  return Math.round(n);
}

const getCitations = (report: any): any[] => {
  if (!report) return [];
  if (Array.isArray(report.research?.citations)) return report.research.citations;
  if (Array.isArray(report.sources)) return report.sources;
  if (Array.isArray(report.research?.sources)) return report.research.sources;
  if (Array.isArray(report.citations)) return report.citations;
  return [];
};
const isHighRisk = (rk: any): boolean => {
  const vals = [rk?.level, rk?.severity, rk?.impact, rk?.riskLevel, rk?.priority];
  return vals.some((v) => typeof v === "string" && /^(high|critical|severe)$/i.test(v.trim()));
};
const hasWeakMitigation = (rk: any): boolean => {
  const m = (rk?.mitigation || rk?.mitigationPlan || "").toString().trim();
  return m.length < 8;
};

const wordCount = (s: string | undefined) => (s || "").trim().split(/\s+/).filter(Boolean).length;
const pickStatus = (wc: number, strong = 25, ok = 10): InputStatus =>
  wc === 0 ? "missing" : wc < ok ? "weak" : wc < strong ? "needs_improvement" : "complete";
const presentStatus = (v: string | undefined): InputStatus =>
  v && v.trim() ? "complete" : "missing";

const STATUS_SCORE: Record<InputStatus, number> = {
  complete: 100, needs_improvement: 65, weak: 35, missing: 0,
};

/** Strip internal/QA/debug wording from consumer-facing strings. */
export function sanitizeForConsumer(text: unknown): string {
  if (text == null) return "";
  return String(text)
    .replace(
      /\b(qa[ -]?failed|fallback used|template mismatch|source notes empty|raw (edge|function) error|internal repair attempt|developer (diagnostics?|error)|report quality weak|repair attempt|debug)\b/gi,
      "",
    )
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Deep-walk an object and sanitize every string leaf. */
export function deepSanitize<T>(value: T): T {
  if (value == null) return value;
  if (typeof value === "string") return sanitizeForConsumer(value) as unknown as T;
  if (Array.isArray(value)) return value.map(deepSanitize) as unknown as T;
  if (typeof value === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(value as any)) out[k] = deepSanitize(v);
    return out;
  }
  return value;
}

/* ---------------- Input Quality ---------------- */
const FIELD_DEFS: Array<{
  key: string; label: string;
  evaluator: (v: string, all: any) => InputStatus;
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
    evaluator: (v) => pickStatus(wordCount((v || "").replace(/https?:\/\/\S+/g, "x")), 6, 2),
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

export function assessInputQuality(inputs: any) {
  const fields: InputFieldAssessment[] = FIELD_DEFS.map(({ key, label, evaluator, impact, suggestion }) => ({
    key, label,
    status: evaluator(String(inputs?.[key] ?? ""), inputs),
    impact, suggestion,
  }));
  const overall = Math.round(
    fields.reduce((sum, f) => sum + STATUS_SCORE[f.status], 0) / fields.length,
  );
  const contradictions: string[] = [];
  const budgetVeryLow = /< ?\$?50/i.test(inputs?.budgetRange || "");
  const timelineVeryShort = /< ?3/i.test(inputs?.timeline || "");
  const teamLarge = /> ?100|51/.test(inputs?.teamSize || "");
  if (budgetVeryLow && teamLarge) contradictions.push("Budget is very small for a team of this size.");
  if (timelineVeryShort && /capex|infrastructure|construction/i.test(inputs?.industry || ""))
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
export function deriveEvidenceMix(report: any, inputs: any) {
  const iq = assessInputQuality(inputs);
  const citations = report?.research?.citations?.length || 0;
  const confAvg = report?.scores?.confidence
    ? Object.values(report.scores.confidence).reduce((a: number, b: any) => a + (Number(b) || 0), 0) / 6
    : 50;
  const confPct = Math.max(0, Math.min(100, confidencePercent(confAvg) ?? 50));
  let userPct = Math.round(iq.overall * 0.45);
  let webPct = Math.round(Math.min(50, citations * 6));
  let aiPct = Math.max(0, 100 - userPct - webPct);
  const aiFloor = Math.round(Math.max(10, 100 - confPct));
  if (aiPct < aiFloor) {
    const deficit = aiFloor - aiPct;
    const take = Math.min(deficit, userPct);
    userPct -= take; aiPct += take;
  }
  const total = userPct + webPct + aiPct;
  if (total !== 100) webPct += 100 - total;
  return { userInputPercent: userPct, webResearchPercent: webPct, aiAssumptionPercent: aiPct };
}

/* ---------------- Score Explanation ---------------- */
const DIM_LABEL: Record<ScoreExplanationRow["dimension"], string> = {
  financial: "Financial", market: "Market", achievability: "Achievability",
  risk: "Risk", timing: "Timing", operational: "Operational",
};

export function deriveScoreExplanation(report: any, inputs: any): ScoreExplanationRow[] {
  const iq = assessInputQuality(inputs);
  const allWeak = [...iq.weak, ...iq.missing, ...iq.needsImprovement];
  const dims = Object.keys(DIM_LABEL) as ScoreExplanationRow["dimension"][];
  return dims.map((dim) => {
    const score = Number(report?.scores?.[dim] ?? 0);
    const positives: string[] = [];
    const negatives: string[] = [];
    if (dim === "financial") {
      if (report?.financials?.ltvCacRatio) positives.push(`LTV:CAC reported as ${report.financials.ltvCacRatio}.`);
      if (inputs?.revenueModel) positives.push(`Revenue model defined (${inputs.revenueModel}).`);
      if (inputs?.budgetRange) positives.push(`Budget range provided (${inputs.budgetRange}).`);
      if (!inputs?.revenueModel) negatives.push("Revenue model not specified.");
      if (allWeak.includes("Financial & business assumptions")) negatives.push("Financial assumptions are thin.");
      if (!inputs?.budgetRange) negatives.push("Budget not provided.");
    } else if (dim === "market") {
      if (report?.market?.tamValue) positives.push(`TAM estimated at ${report.market.tamValue}.`);
      if (inputs?.location) positives.push(`Geography specified (${inputs.location}).`);
      if ((report?.research?.citations?.length ?? 0) > 4) positives.push("Multiple public sources support market context.");
      if (!inputs?.location) negatives.push("No geography provided.");
      if ((report?.research?.citations?.length ?? 0) < 3) negatives.push("Limited public evidence captured.");
      if (allWeak.includes("Competitors")) negatives.push("Few competitors supplied.");
    } else if (dim === "achievability") {
      if (inputs?.technologyReadiness) positives.push(`Technology readiness: ${inputs.technologyReadiness}.`);
      if (inputs?.founderExperience) positives.push("Founder/team experience provided.");
      if (!inputs?.technologyReadiness) negatives.push("Technology readiness not set.");
      if (!inputs?.founderExperience) negatives.push("Team experience not described.");
    } else if (dim === "risk") {
      const mitigated = (report?.risks || []).filter((x: any) => x.mitigation && x.mitigation.length > 10).length;
      if (mitigated > 0) positives.push("Most risks have an associated mitigation.");
      if (inputs?.regulatoryConsiderations) positives.push("Regulatory context provided.");
      const unmitigated = (report?.risks || []).filter((x: any) => !x.mitigation || x.mitigation.length < 8).length;
      if (unmitigated > 0) negatives.push("One or more risks lack mitigation.");
      if (!inputs?.knownRisks) negatives.push("User-supplied risks are missing.");
    } else if (dim === "timing") {
      if (inputs?.timeline) positives.push(`Timeline specified (${inputs.timeline}).`);
      if (report?.market?.tamCagr) positives.push(`Market growing at ${report.market.tamCagr}.`);
      if (!inputs?.timeline) negatives.push("Timeline not provided.");
    } else if (dim === "operational") {
      if (inputs?.teamSize) positives.push(`Team size specified (${inputs.teamSize}).`);
      if (inputs?.dependencies) positives.push("Key dependencies identified.");
      if (!inputs?.teamSize) negatives.push("Team size not provided.");
      if (!inputs?.dependencies) negatives.push("Dependencies not listed.");
    }
    const improveActions: Record<ScoreExplanationRow["dimension"], string[]> = {
      financial: ["Add pricing and expected customer count.", "Quantify CAC, churn, and gross margin.", "Confirm budget range."],
      market: ["Add the target geography and segment.", "Paste 2–4 competitor URLs.", "Cite a recent market sizing source."],
      achievability: ["Select technology readiness.", "Describe team/founder experience and prior wins."],
      risk: ["List 3+ risks with mitigation.", "Document regulatory and compliance constraints."],
      timing: ["Choose a realistic timeline.", "Note any seasonality or policy windows."],
      operational: ["Specify team size and key roles.", "List external dependencies and SLAs."],
    };
    const decisionImplication = score >= 8.5
      ? "Strong contribution to the recommendation."
      : score >= 7 ? "Solid but needs validation before commitment."
      : score >= 5 ? "Material drag — needs evidence or design changes."
      : "Significant blocker. Address before further investment.";
    return {
      dimension: dim, label: DIM_LABEL[dim], score,
      positiveDrivers: positives.length ? positives : ["No notable positive drivers detected from inputs."],
      negativeDrivers: negatives.length ? negatives : ["No specific issues detected in inputs."],
      missingEvidence: negatives,
      improvementActions: improveActions[dim],
      decisionImplication,
    };
  });
}

/* ---------------- Claim Evidence Map ---------------- */
export function deriveClaimEvidenceMap(report: any, inputs: any): ClaimEvidenceRow[] {
  const mix = deriveEvidenceMix(report, inputs);
  const cites = (report?.research?.citations || []).map((c: any) => c.source || c.title).filter(Boolean) as string[];
  const conf = (n: number): ClaimEvidenceRow["confidence"] => n >= 70 ? "High" : n >= 45 ? "Medium" : "Low";
  const rows: ClaimEvidenceRow[] = [
    {
      claimId: "market-growth",
      claimText: `The market has growth potential (${report?.market?.tamCagr || "CAGR not stated"}).`,
      reportSection: "Market Analysis",
      userInputPercent: Math.round(mix.userInputPercent * 0.3),
      webResearchPercent: Math.round(mix.webResearchPercent * 1.2),
      aiAssumptionPercent: 0,
      confidence: conf(confidencePercent(report?.scores?.confidence?.market) ?? 50),
      sources: cites.slice(0, 3),
      userCanImproveBy: "Add a recent market-sizing source or analyst report.",
    },
    {
      claimId: "break-even",
      claimText: `Break-even projected: ${report?.financials?.breakEvenSummary || "not stated"}.`,
      reportSection: "Financial Plan",
      userInputPercent: Math.round(mix.userInputPercent * 1.3),
      webResearchPercent: Math.round(mix.webResearchPercent * 0.2),
      aiAssumptionPercent: 0,
      confidence: conf(confidencePercent(report?.scores?.confidence?.financial) ?? 50),
      sources: [],
      userCanImproveBy: "Add pricing, expected customers, churn, and gross margin.",
    },
    {
      claimId: "cac",
      claimText: `Customer acquisition economics appear ${report?.financials?.ltvCacRatio ? `viable (LTV:CAC ${report.financials.ltvCacRatio})` : "uncertain"}.`,
      reportSection: "Financial Plan",
      userInputPercent: Math.round(mix.userInputPercent * 0.9),
      webResearchPercent: Math.round(mix.webResearchPercent * 0.4),
      aiAssumptionPercent: 0,
      confidence: conf(confidencePercent(report?.scores?.confidence?.financial) ?? 50),
      sources: [],
      userCanImproveBy: "Provide channel CAC benchmarks or pilot data.",
    },
    {
      claimId: "competition",
      claimText: `Competition appears ${(report?.competitors?.length || 0) >= 4 ? "moderate to strong" : "limited / poorly mapped"}.`,
      reportSection: "Competitive Landscape",
      userInputPercent: Math.round(mix.userInputPercent * 0.6 + ((inputs?.competitorUrls || "").split(/\s+/).filter(Boolean).length * 6)),
      webResearchPercent: Math.round(mix.webResearchPercent * 0.9),
      aiAssumptionPercent: 0,
      confidence: conf(confidencePercent(report?.scores?.confidence?.market) ?? 50),
      sources: cites.slice(0, 2),
      userCanImproveBy: "Paste 2–4 competitor URLs and note their pricing or positioning.",
    },
    {
      claimId: "regulatory",
      claimText: `Regulatory risk assessed as ${(report?.risks || []).find((r: any) => /regulat|complian/i.test(r.name))?.level || "medium"}.`,
      reportSection: "Risk Assessment",
      userInputPercent: inputs?.regulatoryConsiderations ? 55 : 15,
      webResearchPercent: 20,
      aiAssumptionPercent: 0,
      confidence: conf(confidencePercent(report?.scores?.confidence?.risk) ?? 50),
      sources: [],
      userCanImproveBy: "List the specific regulators, licences, or standards.",
    },
  ].map((r) => {
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

/* ---------------- Verdict ---------------- */
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

  return { verdict, recommendationLabel, nextStepHint, blockers, overallConfidencePct: args.overallConfidencePct };
}

/* ---------------- Map verdict back to legacy 4-state ---------------- */
export function legacyVerdictFromConsumer(v: ConsumerVerdict): "PROCEED" | "PROCEED WITH CAUTION" | "REVISE" | "DO NOT PROCEED" {
  switch (v) {
    case "PROCEED": return "PROCEED";
    case "CONDITIONAL PROCEED":
    case "CONDITIONAL PROCEED WITH VALIDATION":
      return "PROCEED WITH CAUTION";
    case "IMPROVE INPUTS BEFORE INVESTMENT DECISION":
    case "REVISE": return "REVISE";
    case "DO NOT PROCEED": return "DO NOT PROCEED";
  }
}

/* ---------------- Ensure / enrich ---------------- */
export function ensureEvidenceFields(report: any, inputs: any): any {
  if (!report || !inputs) return report;
  const r: any = { ...report };

  if (!r.inputCompleteness || r.inputQualityScore == null) {
    const iq = assessInputQuality(inputs);
    r.inputQualityScore = iq.overall;
    r.inputCompleteness = {
      overall: iq.overall,
      missingFields: iq.missing,
      weakFields: [...iq.weak, ...iq.needsImprovement],
      contradictoryFields: iq.contradictions,
    };
  }
  if (!r.evidenceMix) r.evidenceMix = deriveEvidenceMix(r, inputs);
  if (!r.scoreExplanation || r.scoreExplanation.length === 0)
    r.scoreExplanation = deriveScoreExplanation(r, inputs);
  if (!r.claimEvidenceMap || r.claimEvidenceMap.length === 0)
    r.claimEvidenceMap = deriveClaimEvidenceMap(r, inputs);

  const confAvg = r.scores?.confidence
    ? Object.values(r.scores.confidence).reduce((a: number, b: any) => a + (Number(b) || 0), 0) / 6
    : 50;
  const overallConfPct = Math.max(0, Math.min(100, confidencePercent(confAvg) ?? 50));
  const marketEvidenceWeak = (r.research?.citations?.length ?? 0) < 3 || (r.scores?.market ?? 0) < 6;
  const financialsMissing = !inputs.revenueModel || !inputs.budgetRange || (r.scores?.financial ?? 0) < 5;
  const criticalRisksWithoutMitigation = (r.risks || []).some(
    (rk: any) => rk.level === "High" && (!rk.mitigation || rk.mitigation.trim().length < 8),
  );

  const decision = computeVerdict({
    score: r.scores?.overall ?? 0,
    overallConfidencePct: overallConfPct,
    inputQuality: r.inputQualityScore ?? 0,
    aiAssumptionPct: r.evidenceMix?.aiAssumptionPercent ?? 0,
    marketEvidenceWeak, financialsMissing, criticalRisksWithoutMitigation,
  });
  r.decision = decision;
  // Keep legacy 4-state verdict authoritative server-side too.
  if (r.scores) r.scores.verdict = legacyVerdictFromConsumer(decision.verdict);

  return r;
}
