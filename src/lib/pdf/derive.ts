// =============================================================================
// Phase 2 — Derivation helpers for the PDF
// -----------------------------------------------------------------------------
// Pure functions that turn FeasibilityReport + ConceptInputs into compact,
// executive-readable structures (drivers, blockers, memo sections, validation
// roadmap, legacy financial summary). All helpers are safe on partial data.
// =============================================================================

import type { ConceptInputs, FeasibilityReport } from "@/types/analysis";
import { assessInputQuality, sanitizeForConsumer } from "@/lib/evidence";

const s = (v: unknown): string => sanitizeForConsumer(v == null ? "" : String(v));

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

export interface MemoSections {
  recommendation: string[];
  whyCanWork: string[];
  whyCanFail: string[];
  moneyLogic: string[];
  validation: string[];
  next30Days: string[];
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
  if (conf != null) recommendation.push(`Decision confidence: ${conf}%.`);
  if (decision?.nextStepHint) recommendation.push(firstSentence(s(decision.nextStepHint)));

  const whyCanWork = deriveDecisionDrivers(report, inputs);
  const whyCanFail = deriveDecisionBlockers(report, inputs);

  const moneyLogic: string[] = [];
  const fin = report.financials;
  if (fin.investmentRange) moneyLogic.push(`Investment range: ${withCurrency(fin.investmentRange, fin.currency)}.`);
  if (fin.breakEvenSummary) moneyLogic.push(`Break-even (base): ${s(fin.breakEvenSummary)}.`);
  if (fin.ltvCacRatio) moneyLogic.push(`LTV : CAC — ${s(fin.ltvCacRatio)}.`);
  const base = fin.scenarios?.find((sc) => /base/i.test(sc.scenario));
  if (base) moneyLogic.push(`Base case: ${s(base.annualRevenue)} revenue, ${s(base.subscribersYr1)} customers (Yr 1).`);
  if (!moneyLogic.length) {
    moneyLogic.push("A detailed financial model should be generated and validated against project-specific operating assumptions before funding approval.");
  }

  const validation: string[] = [];
  const iq = assessInputQuality(inputs);
  for (const f of [...iq.missing, ...iq.weak].slice(0, 3)) {
    validation.push(`Validate: ${s(f)}.`);
  }
  for (const r of (report.risks || []).filter((x) => /high/i.test(x.level)).slice(0, 2)) {
    validation.push(`Confirm mitigation for ${s(r.name)}.`);
  }
  if (decision?.nextStepHint && validation.length < 4) {
    validation.push(firstSentence(s(decision.nextStepHint)));
  }
  if (!validation.length) {
    validation.push("Run a focused validation sprint before funding approval.");
  }

  const next30Days: string[] = [];
  const seed = (report.nextSteps?.length ? report.nextSteps : report.recommendations) || [];
  for (const item of seed.slice(0, 4)) next30Days.push(firstSentence(s(item)));

  return {
    recommendation,
    whyCanWork: whyCanWork.length ? whyCanWork : ["Strong overall feasibility profile across the FMART dimensions."],
    whyCanFail: whyCanFail.length ? whyCanFail : ["No material blockers detected — confirm during validation."],
    moneyLogic: moneyLogic.slice(0, 4),
    validation: validation.slice(0, 4),
    next30Days: next30Days.slice(0, 4),
  };
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

export function deriveRoadmap(report: FeasibilityReport): RoadmapPhase[] {
  const next = report.nextSteps?.length ? report.nextSteps : report.recommendations || [];
  const safe = next.map(s).filter(Boolean);
  const phase: RoadmapPhase[] = [
    { window: "Next 30 days", items: safe.slice(0, 3) },
    { window: "Days 31 – 60", items: safe.slice(3, 6) },
    { window: "Days 61 – 90", items: safe.slice(6, 9) },
  ];
  return phase.filter((p) => p.items.length > 0);
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
    investmentRange: fin.investmentRange ? `${s(fin.investmentRange)} ${cur}`.trim() : "Requires validation",
    breakEven: s(fin.breakEvenSummary) || "Requires validation",
    ltvCac: s(fin.ltvCacRatio) || "Requires validation",
    capExMid: fin.capExTotal?.mid != null ? `${fin.capExTotal.mid.toLocaleString("en-US")} ${cur}`.trim() : "Requires validation",
    opExMonthly: opExMonthly > 0 ? `${opExMonthly.toLocaleString("en-US")} ${cur}/mo`.trim() : "Requires validation",
    topFinancialRisks,
  };
}
