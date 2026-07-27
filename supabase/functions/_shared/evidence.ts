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

/** Replace internal/QA/debug wording with consumer-safe phrasing. */
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
export function sanitizeForConsumer(text: unknown): string {
  if (text == null) return "";
  let out = String(text);
  for (const [re, sub] of FORBIDDEN_PATTERNS) out = out.replace(re, sub);
  return out.replace(/\s{2,}/g, " ").replace(/\s+([.,;:])/g, "$1").trim();
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

/* ---------------- Brief Clarity ---------------- */
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
  { key: "knownRisks", label: "Known risks",
    evaluator: (v) => pickStatus(wordCount(v), 25, 8),
    impact: "Without explicit risks, Risk score relies on AI inference.",
    suggestion: "List 3+ risks (regulatory, technical, market, execution)." },
  { key: "founderExperience", label: "Team / founder experience",
    evaluator: (v) => pickStatus(wordCount(v), 20, 6),
    impact: "Improves Achievability and Operational confidence.",
    suggestion: "Add years of experience, prior exits, and domain expertise." },
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
  const citations = getCitations(report).length;
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
      if (getCitations(report).length > 4) positives.push("Multiple public sources support market context.");
      if (!inputs?.location) negatives.push("No geography provided.");
      if (getCitations(report).length < 3) negatives.push("Limited public evidence captured.");
    } else if (dim === "achievability") {
      if (inputs?.founderExperience) positives.push("Founder/team experience provided.");
      if (!inputs?.founderExperience) negatives.push("Team experience not described.");
    } else if (dim === "risk") {
      const mitigated = (report?.risks || []).filter((x: any) => x.mitigation && x.mitigation.length > 10).length;
      if (mitigated > 0) positives.push("Most risks have an associated mitigation.");
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
      market: ["Confirm the target geography and segment.", "Validate demand through customer interviews."],
      achievability: ["Describe team/founder experience and prior wins.", "Validate the selected technology approach."],
      risk: ["List known private risks with mitigation.", "Confirm which researched compliance requirements apply."],
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
  const cites = getCitations(report).map((c: any) => c?.source || c?.title || c?.url).filter(Boolean) as string[];
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
      userCanImproveBy: "Validate the researched competitor set and positioning with customers.",
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
  aiAssumptionPct: number;
  marketEvidenceWeak: boolean;
  financialsMissing: boolean;
  criticalRisksWithoutMitigation: boolean;
}): DecisionVerdict {
  const blockers: string[] = [];
  let verdict: ConsumerVerdict = "PROCEED";

  if (args.score >= 7.5) {
    verdict = "PROCEED";
  } else if (args.score >= 6.0) {
    verdict = args.overallConfidencePct >= 70
      ? "CONDITIONAL PROCEED"
      : "CONDITIONAL PROCEED WITH VALIDATION";
  } else if (args.score >= 4.5) {
    verdict = "REVISE";
  } else {
    verdict = "DO NOT PROCEED";
  }

  if (args.overallConfidencePct < 50) {
    blockers.push("Analysis confidence is below 50% — validation required before any commitment.");
  }
  if (args.criticalRisksWithoutMitigation) {
    blockers.push("Critical/high risk has no mitigation. Address before proceeding.");
  }

  let nextStepHint = "Refine assumptions and validate with stakeholders.";
  if (args.marketEvidenceWeak) nextStepHint = "Validate market demand (customer interviews, sizing sources) before any launch decision.";
  if (args.financialsMissing) nextStepHint = "Complete financial validation (pricing, CAC, churn, gross margin, break-even) before execution.";

  let recommendationLabel = verdict.charAt(0) + verdict.slice(1).toLowerCase();
  if (args.aiAssumptionPct > 40 && !/Needs validation/i.test(recommendationLabel)) {
    recommendationLabel += " · Needs validation";
  }
  if (args.criticalRisksWithoutMitigation && !/Needs validation/i.test(recommendationLabel)) {
    recommendationLabel += " · Needs validation";
  }

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
  const marketEvidenceWeak = getCitations(r).length < 3 || (r.scores?.market ?? 0) < 6;
  const assumptionsThin = !(inputs?.assumptions && String(inputs.assumptions).trim().split(/\s+/).length >= 8);
  const financialsMissing =
    !inputs?.revenueModel ||
    !inputs?.budgetRange ||
    assumptionsThin ||
    !r.financials?.breakEvenSummary ||
    !r.financials?.ltvCacRatio ||
    (r.scores?.financial ?? 0) < 5;
  const criticalRisksWithoutMitigation = (r.risks || []).some(
    (rk: any) => isHighRisk(rk) && hasWeakMitigation(rk),
  );

  if (!r.decision) {
    r.decision = computeVerdict({
      score: r.scores?.overall ?? 0,
      overallConfidencePct: overallConfPct,
      aiAssumptionPct: r.evidenceMix?.aiAssumptionPercent ?? 0,
      marketEvidenceWeak, financialsMissing, criticalRisksWithoutMitigation,
    });
  }

  return r;
}

/* ---------------- Version comparison (mirrors src/lib/evidence.ts) ---------------- */
export function buildVersionEntry(
  previous: any,
  next: any,
  prevInputs: Record<string, unknown>,
  nextInputs: Record<string, unknown>,
): Record<string, unknown> {
  const changed: string[] = [];
  for (const key of Object.keys(nextInputs ?? {})) {
    if ((prevInputs as any)?.[key] !== (nextInputs as any)?.[key]) changed.push(key);
  }
  const avg = (report: any) =>
    report?.scores?.confidence
      ? Object.values(report.scores.confidence).reduce(
          (a: number, b: any) => a + (Number(b) || 0),
          0,
        ) / 6
      : 50;
  const prevConfPct = confidencePercent(avg(previous)) ?? 50;
  const nextConfPct = confidencePercent(avg(next)) ?? 50;
  const prevAi = previous?.evidenceMix?.aiAssumptionPercent ?? 0;
  const nextAi = next?.evidenceMix?.aiAssumptionPercent ?? 0;
  const prevReadiness = Number(previous?.decisionReadinessScore ?? 0);
  const nextReadiness = Number(next?.decisionReadinessScore ?? 0);
  const prevResearch = Number(previous?.research?.quality?.score ?? 0);
  const nextResearch = Number(next?.research?.quality?.score ?? 0);
  const unresolvedFields = (report: any) =>
    new Set<string>(
      (report?.resolvedConcept?.unresolvedPrivateDecisions ?? [])
        .map((decision: any) => String(decision?.field ?? ""))
        .filter(Boolean),
    );
  const prevUnresolved = unresolvedFields(previous);
  const nextUnresolved = unresolvedFields(next);
  const unresolvedDecisionsAdded = Array.from(nextUnresolved)
    .filter((field) => !prevUnresolved.has(field));
  const unresolvedDecisionsResolved = Array.from(prevUnresolved)
    .filter((field) => !nextUnresolved.has(field));

  const summaryParts: string[] = [];
  if (changed.length) {
    summaryParts.push(`Updated ${changed.length} field${changed.length === 1 ? "" : "s"}.`);
  }
  if (nextConfPct > prevConfPct + 2) summaryParts.push("Confidence improved.");
  else if (nextConfPct < prevConfPct - 2) {
    summaryParts.push("Confidence dropped — new info revealed weaknesses.");
  }
  if (nextAi < prevAi - 3) summaryParts.push("AI assumption ratio decreased.");
  if (nextReadiness > prevReadiness) summaryParts.push("Decision readiness improved.");
  if (nextResearch > prevResearch) summaryParts.push("Research quality improved.");
  if (unresolvedDecisionsResolved.length > 0) {
    summaryParts.push(`${unresolvedDecisionsResolved.length} private decision${unresolvedDecisionsResolved.length === 1 ? "" : "s"} resolved.`);
  }
  if (!summaryParts.length) summaryParts.push("Re-run produced minor changes.");

  const prevScore = Number(previous?.scores?.overall ?? 0);
  const nextScore = Number(next?.scores?.overall ?? 0);

  return {
    versionId: `v${Date.now()}`,
    createdAt: new Date().toISOString(),
    changedInputs: changed,
    previousScore: prevScore,
    newScore: nextScore,
    scoreDelta: Number((nextScore - prevScore).toFixed(2)),
    previousConfidence: prevConfPct,
    newConfidence: nextConfPct,
    previousAiAssumptionPercent: prevAi,
    newAiAssumptionPercent: nextAi,
    confidenceDelta: nextConfPct - prevConfPct,
    previousDecisionReadiness: prevReadiness,
    newDecisionReadiness: nextReadiness,
    decisionReadinessDelta: Number((nextReadiness - prevReadiness).toFixed(2)),
    previousResearchQuality: prevResearch,
    newResearchQuality: nextResearch,
    researchQualityDelta: Number((nextResearch - prevResearch).toFixed(2)),
    unresolvedDecisionsAdded,
    unresolvedDecisionsResolved,
    summary: summaryParts.join(" "),
  };
}
