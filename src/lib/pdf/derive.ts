// =============================================================================
// Phase 2 — Derivation helpers for the PDF
// -----------------------------------------------------------------------------
// Pure functions that turn FeasibilityReport + ConceptInputs into compact,
// executive-readable structures (drivers, blockers, memo sections, validation
// roadmap, legacy financial summary). All helpers are safe on partial data.
// =============================================================================

import type { ConceptInputs, FeasibilityReport } from "@/types/analysis";
import { assessInputQuality, sanitizeForConsumer } from "@/lib/evidence";
import { projectLabels } from "./project";

const s = (v: unknown): string => sanitizeForConsumer(v == null ? "" : String(v));

/** Append a currency code unless `value` already contains it (case-insensitive). */
const withCurrency = (value: string | undefined, currency: string | undefined): string => {
  const v = s(value);
  const c = (currency || "").trim();
  if (!v) return "";
  if (!c) return v;
  return new RegExp(`\\b${c.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\b`, "i").test(v) ? v : `${v} ${c}`;
};

const firstSentence = (txt: string): string => {
  const t = (txt || "").trim();
  if (!t) return "";
  const m = t.split(/(?<=[.!?])\s/)[0] || t;
  return m.length > 160 ? m.slice(0, 157).trimEnd() + "…" : m;
};

/* ----------------------------- decision drivers ---------------------------- */

export function deriveDecisionDrivers(
  report: FeasibilityReport,
  inputs: ConceptInputs,
): string[] {
  const out: string[] = [];

  const dims = [
    { k: "operational" as const, l: "Operational",   finding: report.scores.operationalFinding },
    { k: "achievability" as const, l: "Achievability", finding: report.scores.achievabilityFinding },
    { k: "financial" as const, l: "Financial",      finding: report.scores.financialFinding },
    { k: "market" as const, l: "Market",          finding: report.scores.marketFinding },
    { k: "timing" as const, l: "Timing",          finding: report.scores.timingFinding },
  ];

  dims
    .map((d) => ({ ...d, score: Number((report.scores as unknown as Record<string, number>)[d.k] ?? 0) }))
    .filter((d) => d.score >= 7.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .forEach((d) => {
      const f = firstSentence(s(d.finding));
      out.push(f ? `${d.l}: ${f}` : `${d.l} scores ${d.score.toFixed(1)} / 10.`);
    });

  if (out.length < 3 && report.research?.keySignals?.length) {
    for (const sig of report.research.keySignals) {
      if (out.length >= 3) break;
      const txt = firstSentence(s(sig));
      if (txt) out.push(txt);
    }
  }

  if (out.length < 3 && inputs.founderExperience) {
    out.push(`Team: ${firstSentence(s(inputs.founderExperience))}`);
  }

  return out.slice(0, 3);
}

/* ----------------------------- decision blockers --------------------------- */

export function deriveDecisionBlockers(
  report: FeasibilityReport,
  inputs: ConceptInputs,
): string[] {
  const out: string[] = [];

  for (const b of report.decision?.blockers ?? []) {
    if (out.length >= 3) break;
    const t = firstSentence(s(b));
    if (t) out.push(t);
  }

  if (out.length < 3 && report.risks?.length) {
    const high = report.risks.filter((r) =>
      /high|critical|severe/i.test(`${r.level} ${r.impact}`)
    );
    for (const r of high) {
      if (out.length >= 3) break;
      out.push(s(r.name));
    }
  }

  if (out.length < 3) {
    const iq = assessInputQuality(inputs);
    for (const f of [...iq.missing, ...iq.weak]) {
      if (out.length >= 3) break;
      out.push(`Input gap — ${s(f)}.`);
    }
  }

  const mix = report.evidenceMix;
  if (out.length < 3 && mix && mix.aiAssumptionPercent > 40) {
    out.push(`AI assumption ratio is ${mix.aiAssumptionPercent}% — strengthen inputs before commitment.`);
  }

  return out.slice(0, 3);
}

/* ----------------------------- executive memo ------------------------------ */

/** Extract a compact break-even / payback string (e.g. "Month 30"). */
export function shortBreakEven(raw: string | undefined): string {
  const t = s(raw || "").trim();
  if (!t) return "";
  const m = t.match(/(month\s*\d+(?:\s*[-–—]\s*\d+)?|m\d+|year\s*\d+|y\d+|q[1-4]\s*y?\d*)/i);
  if (m) return m[0].replace(/\s+/g, " ").replace(/^(\w)/, (c) => c.toUpperCase());
  const head = t.split(/[,.;:(]| based| by| with/i)[0].trim();
  return head.length > 28 ? head.slice(0, 26) + "…" : head;
}

export interface MemoSections {
  recommendation: string[];
  whyCanWork: string[];
  whyCanFail: string[];
  moneyLogic: string[];
  validation: string[];
  next30Days: string[];
}

function baseCaseDisplay(report: FeasibilityReport, internal: boolean) {
  const base = report.financials.scenarios?.find((scenario) => /base/i.test(scenario.scenario));
  if (!base) return { outcome: "", participation: "" };
  if (internal) {
    const outcome = s(base.annualValueDisplay || (base.annualFinancialBenefit != null
      ? `${report.financials.currency} ${base.annualFinancialBenefit.toLocaleString()}`
      : "Requires validation"));
    const participation = base.adoptionRate != null
      ? `${Math.round(base.adoptionRate * 100)}%`
      : "Requires validation";
    return { outcome, participation };
  }
  return { outcome: s(base.annualRevenue), participation: s(base.subscribersYr1) };
}

export function deriveMemoSections(
  report: FeasibilityReport,
  inputs: ConceptInputs,
): MemoSections {
  const decision = report.decision;
  const verdict = s(decision?.verdict || report.scores.verdict);
  const conf = decision?.overallConfidencePct;

  const recommendation: string[] = [];
  if (verdict) recommendation.push(`Verdict: ${verdict}.`);
  if (conf != null) recommendation.push(`Model-estimated confidence: ${conf}%.`);
  if (decision?.nextStepHint) recommendation.push(firstSentence(s(decision.nextStepHint)));

  const whyCanWork = deriveDecisionDrivers(report, inputs);
  const whyCanFail = deriveDecisionBlockers(report, inputs);

  const labels = projectLabels(inputs);
  const moneyLogic: string[] = [];
  const fin = report.financials;
  if (fin.investmentRange) moneyLogic.push(`Investment: ${withCurrency(fin.investmentRange, fin.currency)}.`);
  const be = shortBreakEven(fin.breakEvenSummary);
  if (be) moneyLogic.push(labels.isInternal ? `Payback: ${be} (operational savings).` : `Break-even: ${be}.`);
  if (!labels.isInternal && fin.ltvCacRatio) moneyLogic.push(`LTV : CAC — ${s(fin.ltvCacRatio)}.`);
  const baseCase = baseCaseDisplay(report, labels.isInternal);
  if (baseCase.outcome || baseCase.participation) {
    moneyLogic.push(labels.baseCaseTemplate(baseCase.outcome, baseCase.participation));
  }
  if (!moneyLogic.length) {
    moneyLogic.push("Detailed financial model required before funding approval.");
  }

  const validation: string[] = [];
  const iq = assessInputQuality(inputs);
  for (const f of [...iq.missing, ...iq.weak].slice(0, 3)) {
    validation.push(`Validate ${s(f).toLowerCase()}.`);
  }
  for (const r of (report.risks || []).filter((x) => /high/i.test(x.level)).slice(0, 2)) {
    validation.push(`Confirm mitigation for ${s(r.name)}.`);
  }
  if (!validation.length) validation.push("Run a focused validation sprint before funding approval.");

  const next30Days: string[] = [];
  const seed = (report.nextSteps?.length ? report.nextSteps : report.recommendations) || [];
  for (const item of seed.slice(0, 3)) next30Days.push(firstSentence(s(item)));

  return {
    recommendation: recommendation.slice(0, 3),
    whyCanWork: (whyCanWork.length ? whyCanWork : ["Strong overall feasibility profile across the FMART-O dimensions."]).slice(0, 3),
    whyCanFail: (whyCanFail.length ? whyCanFail : ["No material blockers detected — confirm during validation."]).slice(0, 3),
    moneyLogic: moneyLogic.slice(0, 3),
    validation: validation.slice(0, 3),
    next30Days: next30Days.slice(0, 3),
  };
}

/* ------------------------- executive summary narrative --------------------- */

/** Build 3–4 short narrative paragraphs for the Executive Summary page. */
export function deriveExecutiveSummary(
  report: FeasibilityReport,
  inputs: ConceptInputs,
): string[] {
  const labels = projectLabels(inputs);
  const verdict = s(report.decision?.verdict || report.scores.verdict);
  const conf = report.decision?.overallConfidencePct;
  const overall = (report.scores.overall ?? 0).toFixed(1);
  const fin = report.financials;
  const cur = fin.currency || "";
  const overview = s(inputs.description) || s(report.research?.overview);
  const objectives = s(inputs.strategicObjectives);
  const industry = s(inputs.industry);
  const location = s(inputs.location);
  const topRisks = (report.risks || [])
    .filter((r) => /high|critical/i.test(r.level))
    .slice(0, 2)
    .map((r) => s(r.name));
  const be = shortBreakEven(fin.breakEvenSummary);
  const baseCase = baseCaseDisplay(report, labels.isInternal);
  const baseRev = baseCase.outcome ? withCurrency(baseCase.outcome, cur) : "";

  const out: string[] = [];

  // Para 1 — what & why now
  const p1: string[] = [];
  p1.push(
    `${s(inputs.projectName) || "This project"} is a ${labels.isInternal ? "strategic internal" : "commercial"} initiative${industry ? ` in ${industry}` : ""}${location ? ` (${location})` : ""}.`,
  );
  if (overview) p1.push(firstSentence(overview));
  if (objectives) p1.push(`Its stated objectives are to ${objectives.replace(/\.$/, "").toLowerCase()}.`);
  out.push(p1.filter(Boolean).join(" "));

  // Para 2 — verdict & why conditional
  const verdictReason = verdict && /conditional|caution|improve/i.test(verdict)
    ? "The verdict is conditional because several key assumptions still rest on AI inference or external benchmarks rather than direct evidence from this project."
    : verdict && /proceed/i.test(verdict)
      ? "The signal is positive across the FMART-O dimensions, but execution discipline will determine the outcome."
      : "The current evidence base does not yet support a confident go decision and inputs should be strengthened first.";
  out.push(
    `Overall FMART-O score is ${overall} / 10${conf != null ? ` with a ${conf}% model-estimated confidence indicator` : ""}, leading to a "${verdict || "—"}" recommendation. ${verdictReason}`,
  );

  // Para 3 — money / value logic
  const bits: string[] = [];
  if (fin.investmentRange) bits.push(`The expected investment is ${withCurrency(s(fin.investmentRange), cur)}`);
  if (be) bits.push(labels.isInternal ? `with payback around ${be} driven by operational savings` : `with break-even around ${be}`);
  if (baseRev) bits.push(`and a base case of ${baseRev} ${labels.isInternal ? "in annual savings" : "in annual revenue"}${baseCase.participation ? ` at ${baseCase.participation} ${labels.isInternal ? "adoption" : "Year-1 customers"}` : ""}`);
  out.push(
    bits.length
      ? `${bits.join(", ")}. ${labels.isInternal ? "The value case depends on converting manual effort, duplicated tooling, and governance risk into measurable cost avoidance." : "The value case depends on customer acquisition holding to plan and unit economics improving as the product scales."}`
      : `A detailed financial model is required before funding approval. ${labels.isInternal ? "Savings, payback, and adoption assumptions all need stakeholder validation." : "Revenue, cost, and unit-economics assumptions all need stakeholder validation."}`,
  );

  // Para 4 — risks & what must be validated
  const riskTxt = topRisks.length
    ? `Principal risks include ${topRisks.join(" and ")}.`
    : "No critical risks were flagged, but the assumption register should be reviewed before commitment.";
  const valTxt = labels.isInternal
    ? "Before funding, validate internal demand, baseline cost of the current process, integration scope with legacy systems, and signed sponsor commitment from the priority departments."
    : "Before funding, validate customer demand, pricing, competitive positioning, and the unit economics underpinning the base case.";
  out.push(`${riskTxt} ${valTxt}`);

  return out.filter(Boolean);
}

/* --------------------------- validation roadmap ---------------------------- */

export interface ValidationItem {
  what: string;
  strengthens: string;
  evidence: string;
  impact: string;
}

export function deriveValidationItems(
  report: FeasibilityReport,
  inputs: ConceptInputs,
): ValidationItem[] {
  const iq = assessInputQuality(inputs);
  const items: ValidationItem[] = [];

  // Field-level — sort missing first, then weak
  const fieldOrder = (st: string) => (st === "missing" ? 0 : st === "weak" ? 1 : 2);
  iq.fields
    .filter((f) => f.status !== "complete")
    .sort((a, b) => fieldOrder(a.status) - fieldOrder(b.status))
    .slice(0, 6)
    .forEach((f) => {
      items.push({
        what: s(f.label),
        strengthens: s(f.impact),
        evidence: s(f.suggestion),
        impact: f.status === "missing" ? "High — required input" : "Medium — strengthens confidence",
      });
    });

  // Risk-driven validations
  (report.risks || []).filter((r) => /high/i.test(r.level)).slice(0, 3).forEach((r) => {
    items.push({
      what: `Validate mitigation: ${s(r.name)}`,
      strengthens: "Risk score and decision confidence",
      evidence: s(r.mitigation) || "Document mitigation plan, owner, and trigger.",
      impact: "High — go / no-go implication",
    });
  });

  return items;
}

export interface RoadmapPhase {
  window: "Next 30 days" | "Days 31 – 60" | "Days 61 – 90";
  items: string[];
}

export function deriveRoadmap(report: FeasibilityReport, inputs?: ConceptInputs): RoadmapPhase[] {
  const next = report.nextSteps?.length ? report.nextSteps : report.recommendations || [];
  const safe = next.map(s).filter(Boolean);
  const isInternal = inputs ? projectLabels(inputs).isInternal : false;

  const defaults30 = [
    "Confirm executive sponsor, owner, and target decision date.",
    isInternal
      ? "Document baseline cost, hours, and tools for the current manual process."
      : "Schedule 5–10 customer discovery interviews with the target segment.",
    "Lock the scope of a minimum credible pilot or MVP.",
  ];
  const defaults60 = [
    isInternal
      ? "Confirm written participation from 1–2 priority departments."
      : "Validate pricing and willingness-to-pay with 3–5 prospects.",
    "Finalize vendor / technology choices and the integration plan.",
    "Build a detailed financial model with revised assumptions.",
  ];
  const defaults90 = isInternal
    ? [
        "Run a time-boxed pilot with 1–2 high-impact departments.",
        "Measure reporting time reduction, adoption rate, and training completion against the baseline.",
        "Prepare a funding decision pack with validated cost-avoidance assumptions.",
      ]
    : [
        "Run a paid pilot or early-access cohort with target customers.",
        "Measure conversion, retention, and unit economics against the base case.",
        "Prepare a funding decision pack with validated revenue and CAC assumptions.",
      ];

  return [
    { window: "Next 30 days", items: (safe.slice(0, 3).length ? safe.slice(0, 3) : defaults30).slice(0, 4) },
    { window: "Days 31 – 60", items: (safe.slice(3, 6).length ? safe.slice(3, 6) : defaults60).slice(0, 4) },
    { window: "Days 61 – 90", items: (safe.slice(6, 9).length ? safe.slice(6, 9) : defaults90).slice(0, 4) },
  ];
}

/* -------------------------- legacy financial summary ----------------------- */

export interface LegacyFinancialSummary {
  investmentRange: string;
  breakEven: string;
  ltvCac: string;
  capExMid: string;
  opExMonthly: string;
  topFinancialRisks: string[];
}

export function deriveLegacyFinancialSummary(report: FeasibilityReport): LegacyFinancialSummary {
  const fin = report.financials;
  const cur = fin.currency || "";
  const opExMonthly = (fin.opEx || []).reduce((sum, o) => sum + (o.monthly || 0), 0);
  const topFinancialRisks = (report.risks || [])
    .filter((r) => /financ|revenue|budget|capex|opex|cost|payback|cash|adoption|cac|ltv/i.test(r.name))
    .slice(0, 3)
    .map((r) => `${s(r.name)} — ${s(r.mitigation) || "mitigation requires validation."}`);

  return {
    investmentRange: fin.investmentRange ? withCurrency(fin.investmentRange, cur) : "Requires validation",
    breakEven: (() => {
      const t = s(fin.breakEvenSummary || "").trim();
      if (!t) return "Requires validation";
      const m = t.match(/(month\s*\d+|m\d+|year\s*\d+|y\d+|q[1-4]\s*y?\d*)/i);
      if (m) return m[0].replace(/\s+/g, " ").replace(/^(\w)/, (c) => c.toUpperCase());
      const head = t.split(/[,.;:(]| based| by| with/i)[0].trim();
      return head.length > 28 ? head.slice(0, 26) + "…" : head;
    })(),
    ltvCac: s(fin.ltvCacRatio) || "Requires validation",
    capExMid: fin.capExTotal?.mid != null ? `${fin.capExTotal.mid.toLocaleString("en-US")} ${cur}`.trim() : "Requires validation",
    opExMonthly: opExMonthly > 0 ? `${opExMonthly.toLocaleString("en-US")} ${cur}/mo`.trim() : "Requires validation",
    topFinancialRisks,
  };
}

/* -------------------------- assumption classification ---------------------- */

const BUCKET_KEYWORDS: Array<[string, RegExp]> = [
  // Order matters — most specific first.
  ["Market",            /\b(tam|sam|som|market\s*size|market\s*growth|cagr|customers?|user\s*demand|willing(ness)?\s*to\s*(pay|fund)|adoption\s*rate|target\s*segment|competit(or|ive|ion)|differentiat|positioning|brand)\b/i],
  ["Financial",         /\b(invest(ment)?|capex|opex|revenue|saving|cost(s)?|cash|funding|payback|break[\s-]?even|roi|ltv|cac|arr|mrr|pricing|margin|burn|runway)\b/i],
  ["Risk / Compliance", /\b(regulat|complian|legal|policy|security|privacy|gdpr|pdpa|safety|data\s*quality|integration\s*risk|vendor\s*risk)\b/i],
  ["Operational",       /\b(team|hiring|capacity|timeline|delivery|process|workflow|throughput|stakeholder|vendor|technology\s*read|infrastructure|department|operation|deploy)\b/i],
];

/** Classify an assumption into Market / Financial / Operational / Risk. */
export function bucketAssumption(text: string): string {
  const t = (text || "").toLowerCase();
  for (const [bucket, re] of BUCKET_KEYWORDS) {
    if (re.test(t)) return bucket;
  }
  return "Operational";
}

/* -------------------------- citation confidence ---------------------------- */

/** Heuristic confidence for a citation when the model didn't supply one. */
export function inferCitationConfidence(c: { source?: string; title?: string; takeaway?: string; confidence?: string }): string {
  const supplied = (c.confidence || "").trim();
  if (supplied && supplied !== "—") return supplied;
  const text = `${c.source || ""} ${c.title || ""}`.toLowerCase();
  const body = (c.takeaway || "").trim();
  const isOfficial = /(gov|ministry|world\s*bank|imf|oecd|statista|gartner|mckinsey|deloitte|pwc|kpmg|ey|forrester|idc|nielsen|euromonitor|sama|stats|bureau)/i.test(text);
  const isSpecific = /\d/.test(body) && body.length > 40;
  if (isOfficial && isSpecific) return "High";
  if (isOfficial || isSpecific) return "Medium";
  return "Low";
}
