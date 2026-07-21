import { MAX_BREAK_EVEN_MONTHS, parseUnitAwareNumber } from "./numbers.ts";

const DIMENSIONS = ["financial", "market", "achievability", "risk", "timing", "operational"] as const;
type Dimension = typeof DIMENSIONS[number];
type RecordLike = Record<string, unknown>;

type InputIssue = { code: string; field?: string; message: string };

const DIMENSION_LABELS: Record<Dimension, string> = {
  financial: "Financial",
  market: "Market",
  achievability: "Achievability",
  risk: "Risk",
  timing: "Timing",
  operational: "Operational",
};

const DEFAULT_MISSING_EVIDENCE: Record<Dimension, string> = {
  financial: "Validated pricing, supplier quotations, and unit economics.",
  market: "Primary customer interviews and directly supported market-size evidence.",
  achievability: "A validated architecture, delivery estimate, and capability assessment.",
  risk: "Named risk owners, tested controls, and quantified residual exposure.",
  timing: "A dependency-based implementation schedule with approval lead times.",
  operational: "A documented operating model, staffing plan, and service levels.",
};

const DEFAULT_IMPROVEMENT_ACTION: Record<Dimension, string> = {
  financial: "Validate the cost model and commercial assumptions before commitment.",
  market: "Run customer discovery and replace estimated market figures with direct evidence.",
  achievability: "Complete a technical proof of concept and delivery-capacity review.",
  risk: "Assign controls and owners to the highest-impact risks.",
  timing: "Confirm critical dependencies, approvals, and milestone dates.",
  operational: "Define ownership, staffing, support, and performance measures.",
};

const QUALITY_FIELDS: Array<{ key: string; label: string }> = [
  { key: "strategicObjectives", label: "Strategic objectives" },
  { key: "businessModel", label: "Business model" },
  { key: "revenueModel", label: "Revenue or value model" },
  { key: "founderExperience", label: "Team experience" },
  { key: "dependencies", label: "Dependencies" },
  { key: "assumptions", label: "Assumptions" },
  { key: "constraints", label: "Constraints" },
  { key: "successFactors", label: "Success factors" },
  { key: "knownRisks", label: "Known risks" },
  { key: "regulatoryConsiderations", label: "Regulatory considerations" },
];

const dimensionSchema = {
  type: "object",
  properties: {
    score: { type: "number", description: "0 to 10." },
    confidence: { type: "number", description: "0 to 100 model-estimated confidence." },
    finding: { type: "string", description: "One concise finding, under 180 characters." },
    rationale: { type: "string", description: "One concise evidence-aware rationale, under 320 characters." },
  },
  required: ["score", "confidence", "finding", "rationale"],
};

export const REPORT_SEED_SCHEMA = {
  type: "object",
  properties: {
    executiveSummary: {
      type: "string",
      description: "Two concise paragraphs, together under 900 characters.",
    },
    dimensionScores: {
      type: "object",
      properties: Object.fromEntries(DIMENSIONS.map((dimension) => [dimension, dimensionSchema])),
      required: [...DIMENSIONS],
    },
    market: {
      type: "object",
      properties: {
        currency: { type: "string", enum: ["SAR", "USD", "AED", "EUR", "GBP"] },
        tamLabel: { type: "string" },
        tamValue: { type: "number", description: "Full currency units; use 0 when evidence is insufficient." },
        tamCagrPct: { type: "number" },
        samLabel: { type: "string" },
        samValue: { type: "number", description: "Full currency units; use 0 when evidence is insufficient." },
        samCagrPct: { type: "number" },
        somLabel: { type: "string" },
        somValue: { type: "number", description: "Full currency units; use 0 when evidence is insufficient." },
        somCagrPct: { type: "number" },
        assumptionNote: { type: "string", description: "State what must be validated, under 220 characters." },
      },
      required: ["currency", "tamLabel", "tamValue", "tamCagrPct", "samLabel", "samValue", "samCagrPct", "somLabel", "somValue", "somCagrPct", "assumptionNote"],
    },
    customer: {
      type: "object",
      properties: {
        ageLocation: { type: "string" },
        income: { type: "string" },
        goals: { type: "string" },
        willingnessToPay: { type: "string" },
        behavior: { type: "string" },
      },
      required: ["ageLocation", "income", "goals", "willingnessToPay", "behavior"],
    },
    competitors: {
      type: "array",
      description: "Exactly 3 concise direct or category competitors.",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          model: { type: "string" },
          weakness: { type: "string" },
          edge: { type: "string" },
        },
        required: ["name", "model", "weakness", "edge"],
      },
    },
    research: {
      type: "object",
      properties: {
        overview: { type: "string", description: "Concise synthesis under 600 characters." },
        confidence: { type: "string", enum: ["High", "Medium", "Low"] },
        sentiment: { type: "string", enum: ["Positive", "Mixed", "Negative", "Insufficient data"] },
        keySignals: { type: "array", description: "3 to 5 concise signals.", items: { type: "string" } },
        painPoints: { type: "array", description: "3 to 5 concise pain points.", items: { type: "string" } },
      },
      required: ["overview", "confidence", "sentiment", "keySignals", "painPoints"],
    },
    financialPlan: {
      type: "object",
      properties: {
        currency: { type: "string", enum: ["SAR", "USD", "AED", "EUR", "GBP"] },
        projectType: { type: "string", enum: ["commercial", "internal"] },
        capExItems: {
          type: "array",
          description: "3 to 5 startup-cost assumptions.",
          items: {
            type: "object",
            properties: {
              category: { type: "string" },
              low: { type: "number" },
              high: { type: "number" },
              notes: { type: "string" },
            },
            required: ["category", "low", "high", "notes"],
          },
        },
        opExItems: {
          type: "array",
          description: "3 to 5 monthly operating-cost assumptions.",
          items: {
            type: "object",
            properties: {
              category: { type: "string" },
              monthly: { type: "number" },
            },
            required: ["category", "monthly"],
          },
        },
        scenarios: {
          type: "array",
          description: "Exactly Optimistic, Base Case, and Pessimistic.",
          items: {
            type: "object",
            properties: {
              scenario: { type: "string", enum: ["Optimistic", "Base Case", "Pessimistic"] },
              probabilityPct: { type: "number" },
              annualValue: { type: "number", description: "Revenue or internal financial benefit in full currency units." },
              adoptionRatePct: { type: "number" },
              volumeAssumption: { type: "string" },
              breakEvenMonths: { type: "number", minimum: 0, maximum: MAX_BREAK_EVEN_MONTHS },
              basis: { type: "string", description: "Short assumption basis under 220 characters." },
            },
            required: ["scenario", "probabilityPct", "annualValue", "adoptionRatePct", "volumeAssumption", "breakEvenMonths", "basis"],
          },
        },
        ltvCacRatio: { type: "string", description: "Commercial only; otherwise Requires validation." },
      },
      required: ["currency", "projectType", "capExItems", "opExItems", "scenarios", "ltvCacRatio"],
    },
    risks: {
      type: "array",
      description: "Exactly 5 material risks.",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          probability: { type: "string", enum: ["Low", "Med", "High"] },
          impact: { type: "string", enum: ["Low", "Med", "High"] },
          level: { type: "string", enum: ["Low", "Med", "High"] },
          mitigation: { type: "string" },
        },
        required: ["name", "probability", "impact", "level", "mitigation"],
      },
    },
    funding: {
      type: "array",
      description: "Exactly 3 funding sources.",
      items: {
        type: "object",
        properties: {
          source: { type: "string" },
          sharePct: { type: "number" },
          rationale: { type: "string" },
        },
        required: ["source", "sharePct", "rationale"],
      },
    },
    fundingAdvisory: { type: "string", description: "Concise recommendation under 350 characters." },
    recommendations: { type: "array", description: "Exactly 5 concise actions.", items: { type: "string" } },
    nextSteps: { type: "array", description: "Exactly 4 concise next steps.", items: { type: "string" } },
    evidenceClaims: {
      type: "array",
      description: "3 to 4 key claims only. Use only exact source IDs present in the supplied research context.",
      items: {
        type: "object",
        properties: {
          claimText: { type: "string" },
          reportSection: { type: "string" },
          provenance: { type: "string", enum: ["User input", "Cited source", "Calculation", "AI inference", "Mixed", "Unknown"] },
          supportingSourceIds: { type: "array", items: { type: "string" } },
          conflictingSourceIds: { type: "array", items: { type: "string" } },
          dimensions: { type: "array", items: { type: "string", enum: [...DIMENSIONS] } },
          userCanImproveBy: { type: "string" },
        },
        required: ["claimText", "reportSection", "provenance", "supportingSourceIds", "conflictingSourceIds", "dimensions", "userCanImproveBy"],
      },
    },
  },
  required: ["executiveSummary", "dimensionScores", "market", "customer", "competitors", "research", "financialPlan", "risks", "funding", "fundingAdvisory", "recommendations", "nextSteps", "evidenceClaims"],
};

function asRecord(value: unknown): RecordLike {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as RecordLike : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown, fallback = "Needs validation"): string {
  const result = typeof value === "string" ? value.trim() : "";
  return result || fallback;
}

function finite(value: unknown, fallback = 0): number {
  const result = typeof value === "number" ? value : Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function nonNegative(value: unknown, fallback = 0): number {
  return Math.max(0, finite(value, fallback));
}

function clamp(value: unknown, low: number, high: number, fallback: number): number {
  return Math.max(low, Math.min(high, finite(value, fallback)));
}

function safeBreakEvenMonths(value: unknown, fallback: number): number {
  const candidate = Math.round(finite(value, fallback));
  return candidate >= 0 && candidate <= MAX_BREAK_EVEN_MONTHS ? candidate : fallback;
}

function normalizedAdoptionRate(value: unknown, fallbackPercent: number): number {
  const raw = finite(value, fallbackPercent);
  const ratio = raw > 1 ? raw / 100 : raw;
  return clamp(ratio, 0, 1, fallbackPercent / 100);
}

function limitedStrings(value: unknown, limit: number, fallback: string[]): string[] {
  const items = asArray(value).map((item) => text(item, "")).filter(Boolean).slice(0, limit);
  return items.length ? items : fallback;
}

function normalizeCurrency(seedCurrency: unknown, inputs: Record<string, string>): "SAR" | "USD" | "AED" | "EUR" | "GBP" {
  const candidate = text(seedCurrency, "").toUpperCase();
  if (["SAR", "USD", "AED", "EUR", "GBP"].includes(candidate)) return candidate as "SAR" | "USD" | "AED" | "EUR" | "GBP";
  const location = `${inputs.location ?? ""} ${inputs.budgetRange ?? ""}`;
  if (/saudi|riyadh|jeddah|ksa|\bsar\b/i.test(location)) return "SAR";
  if (/uae|dubai|abu dhabi|\baed\b/i.test(location)) return "AED";
  if (/europe|\beur\b|€/.test(location)) return "EUR";
  if (/uk|united kingdom|\bgbp\b|£/i.test(location)) return "GBP";
  return "USD";
}

function money(currency: string, value: number): string {
  return `${currency} ${Math.round(Math.max(0, value)).toLocaleString("en-US")}`;
}

function marketFigure(currency: string, value: number): string {
  return value > 0 ? money(currency, value) : "Requires validation";
}

function percentage(value: number): string {
  return `${Math.round(Math.max(0, value) * 10) / 10}%`;
}

function normalizedPercentages(raw: number[], defaults: number[]): number[] {
  const values = raw.map((value) => Math.max(0, Number.isFinite(value) ? value : 0));
  const total = values.reduce((sum, value) => sum + value, 0);
  const source = total > 0 ? values : defaults;
  const sourceTotal = source.reduce((sum, value) => sum + value, 0) || 1;
  const result = source.map((value) => Math.round(value / sourceTotal * 100));
  const difference = 100 - result.reduce((sum, value) => sum + value, 0);
  result[result.length - 1] = Math.max(0, result[result.length - 1] + difference);
  return result;
}

function growthChart(tam: number, sam: number, tamCagrPct: number, samCagrPct: number) {
  if (tam <= 0 || sam <= 0) return [];
  const firstYear = new Date().getUTCFullYear();
  const tamRate = Math.max(-0.9, tamCagrPct / 100);
  const samRate = Math.max(-0.9, samCagrPct / 100);
  return Array.from({ length: 5 }, (_, index) => ({
    year: String(firstYear + index),
    tam: Math.round(tam * (1 + tamRate) ** index),
    sam: Math.round(sam * (1 + samRate) ** index),
  }));
}

function fallbackCapEx(inputs: Record<string, string>) {
  const budget = parseUnitAwareNumber(inputs.budgetRange);
  const low = Math.max(0, budget.low ?? (budget.value ? budget.value * 0.75 : 50_000));
  const high = Math.max(low, budget.high ?? (budget.value ? budget.value * 1.25 : 100_000));
  return [
    { category: "Product and implementation", low: Math.round(low * 0.65), high: Math.round(high * 0.65), notes: "AI-estimated assumption — validate with supplier quotations." },
    { category: "Launch, compliance, and contingency", low: Math.round(low * 0.35), high: Math.round(high * 0.35), notes: "AI-estimated assumption — validate before commitment." },
  ];
}

function inputCompleteness(inputs: Record<string, string>, issues: InputIssue[]) {
  const missingFields = QUALITY_FIELDS.filter(({ key }) => !String(inputs[key] ?? "").trim()).map(({ label }) => label);
  const weakFields = QUALITY_FIELDS.filter(({ key }) => {
    const words = String(inputs[key] ?? "").trim().split(/\s+/).filter(Boolean).length;
    return words > 0 && words < 3;
  }).map(({ label }) => label);
  const contradictoryFields = issues
    .filter((issue) => /conflict|timeline_risk|team_size_risk/.test(issue.code))
    .map((issue) => issue.message);
  const completed = QUALITY_FIELDS.length - missingFields.length - weakFields.length * 0.5;
  return {
    overall: Math.max(0, Math.min(100, Math.round(completed / QUALITY_FIELDS.length * 100))),
    missingFields,
    weakFields,
    contradictoryFields,
  };
}

function dimensionRows(seed: RecordLike, primaryRisk: string) {
  const scoreRoot = asRecord(seed.dimensionScores);
  const rows: Array<RecordLike> = [];
  const scores: RecordLike = {};
  const confidence: RecordLike = {};
  const rationale: RecordLike = {};

  for (const dimension of DIMENSIONS) {
    const row = asRecord(scoreRoot[dimension]);
    const score = clamp(row.score, 0, 10, 5);
    const finding = text(row.finding, `${DIMENSION_LABELS[dimension]} requires validation.`);
    const reasoning = text(row.rationale, finding);
    scores[dimension] = score;
    scores[`${dimension}Finding`] = finding;
    confidence[dimension] = clamp(row.confidence, 0, 100, 45);
    rationale[dimension] = reasoning;
    rows.push({
      dimension,
      label: DIMENSION_LABELS[dimension],
      score,
      positiveDrivers: score >= 5 ? [finding] : [reasoning],
      negativeDrivers: score < 5 ? [finding] : [primaryRisk || "Key assumptions still require validation."],
      missingEvidence: [DEFAULT_MISSING_EVIDENCE[dimension]],
      improvementActions: [DEFAULT_IMPROVEMENT_ACTION[dimension]],
      decisionImplication: reasoning,
    });
  }
  scores.confidence = confidence;
  scores.rationale = rationale;
  return { scores, rows };
}

export function buildBaseReportFromSeed(args: {
  seed: Record<string, unknown>;
  inputs: Record<string, string>;
  publicResearch: unknown;
  inputIssues: InputIssue[];
}) {
  const seed = asRecord(args.seed);
  const marketSeed = asRecord(seed.market);
  const financialSeed = asRecord(seed.financialPlan);
  const customerSeed = asRecord(seed.customer);
  const researchSeed = asRecord(seed.research);
  const publicResearch = asRecord(args.publicResearch);
  const currency = normalizeCurrency(financialSeed.currency ?? marketSeed.currency, args.inputs);
  const projectType = text(financialSeed.projectType, "commercial") === "internal" ? "internal" : "commercial";

  const risks = asArray(seed.risks).map(asRecord).slice(0, 5).map((risk) => ({
    name: text(risk.name, "Risk requires validation"),
    probability: ["Low", "Med", "High"].includes(text(risk.probability, "Med")) ? text(risk.probability, "Med") : "Med",
    impact: ["Low", "Med", "High"].includes(text(risk.impact, "Med")) ? text(risk.impact, "Med") : "Med",
    level: ["Low", "Med", "High"].includes(text(risk.level, "Med")) ? text(risk.level, "Med") : "Med",
    mitigation: text(risk.mitigation, "Assign an owner and define a measurable mitigation."),
  }));
  while (risks.length < 5) risks.push({
    name: `Unvalidated project risk ${risks.length + 1}`,
    probability: "Med",
    impact: "Med",
    level: "Med",
    mitigation: "Validate this risk with the accountable owner before commitment.",
  });

  const dimension = dimensionRows(seed, String(risks[0]?.name ?? ""));

  const rawCapEx = asArray(financialSeed.capExItems).map(asRecord).slice(0, 5).map((item) => {
    const low = nonNegative(item.low);
    const high = Math.max(low, nonNegative(item.high, low));
    return {
      category: text(item.category, "Implementation cost"),
      low,
      high,
      notes: text(item.notes, "AI-estimated assumption — validate with supplier quotations."),
    };
  }).filter((item) => item.high > 0 || item.low > 0);
  const capEx = rawCapEx.length ? rawCapEx : fallbackCapEx(args.inputs);
  const capExLow = capEx.reduce((sum, item) => sum + item.low, 0);
  const capExHigh = capEx.reduce((sum, item) => sum + item.high, 0);
  const capExMid = (capExLow + capExHigh) / 2;

  const opEx = asArray(financialSeed.opExItems).map(asRecord).slice(0, 5).map((item) => {
    const monthly = nonNegative(item.monthly);
    return {
      category: text(item.category, "Operating cost"),
      monthly,
      annual: monthly * 12,
    };
  }).filter((item) => item.monthly > 0);
  if (!opEx.length) opEx.push({ category: "Operations and support", monthly: Math.max(1_000, Math.round(capExMid * 0.02)), annual: Math.max(12_000, Math.round(capExMid * 0.24)) });
  const monthlyOpEx = opEx.reduce((sum, item) => sum + item.monthly, 0);

  const scenarioOrder = ["Optimistic", "Base Case", "Pessimistic"];
  const scenarioByName = new Map(asArray(financialSeed.scenarios).map(asRecord).map((scenario) => [text(scenario.scenario, ""), scenario]));
  const scenarioRecords = scenarioOrder.map((name) => scenarioByName.get(name) ?? {});
  const probabilityValues = normalizedPercentages(scenarioRecords.map((scenario) => finite(scenario.probabilityPct)), [25, 50, 25]);
  const scenarios = scenarioRecords.map((scenario, index) => {
    const annualValue = nonNegative(scenario.annualValue);
    const breakEvenMonths = safeBreakEvenMonths(scenario.breakEvenMonths, [12, 24, 36][index]);
    const common = {
      scenario: scenarioOrder[index],
      probability: percentage(probabilityValues[index]),
      breakEven: `${breakEvenMonths} months`,
      adoptionRate: normalizedAdoptionRate(scenario.adoptionRatePct, [75, 50, 25][index]),
      annualValueDisplay: annualValue > 0 ? money(currency, annualValue) : "Requires validation",
      basis: text(scenario.basis, "AI-estimated assumption — validate with project data."),
    };
    return projectType === "internal"
      ? {
          ...common,
          annualLabourCostAvoided: Math.round(annualValue * 0.6),
          annualProductivityBenefit: Math.round(annualValue * 0.4),
          annualFinancialBenefit: annualValue > 0 ? money(currency, annualValue) : "Requires validation",
        }
      : {
          ...common,
          subscribersYr1: text(scenario.volumeAssumption, "Requires validation"),
          annualRevenue: annualValue > 0 ? money(currency, annualValue) : "Requires validation",
        };
  });

  const investmentLow = capExLow + monthlyOpEx * 6;
  const investmentHigh = capExHigh + monthlyOpEx * 6;
  const baseBreakEven = safeBreakEvenMonths(scenarioRecords[1]?.breakEvenMonths, 24);

  const fundingSeed = asArray(seed.funding).map(asRecord).slice(0, 3);
  while (fundingSeed.length < 3) fundingSeed.push({});
  const fundingShares = normalizedPercentages(fundingSeed.map((funding) => finite(funding.sharePct)), [40, 35, 25]);
  const fundingMix = fundingSeed.map((funding, index) => ({
    source: text(funding.source, ["Sponsor or founder funding", "Strategic or institutional funding", "Contingency or phased funding"][index]),
    share: percentage(fundingShares[index]),
    amount: money(currency, investmentHigh * fundingShares[index] / 100),
    rationale: text(funding.rationale, "Use staged funding tied to validated milestones."),
  }));

  const marketCurrency = normalizeCurrency(marketSeed.currency, args.inputs);
  const tam = nonNegative(marketSeed.tamValue);
  const sam = Math.min(tam || Number.POSITIVE_INFINITY, nonNegative(marketSeed.samValue));
  const som = Math.min(sam || Number.POSITIVE_INFINITY, nonNegative(marketSeed.somValue));
  const tamCagr = finite(marketSeed.tamCagrPct);
  const samCagr = finite(marketSeed.samCagrPct);

  const competitors = asArray(seed.competitors).map(asRecord).slice(0, 3).map((competitor) => ({
    name: text(competitor.name, "Category competitor"),
    model: text(competitor.model, "Requires validation"),
    weakness: text(competitor.weakness, "Requires validation"),
    edge: text(competitor.edge, "Requires validation"),
  }));

  const evidenceClaims = asArray(seed.evidenceClaims).map(asRecord).slice(0, 4).map((claim, index) => ({
    claimId: `CLM-AI-${index + 1}`,
    claimText: text(claim.claimText, "Claim requires validation."),
    reportSection: text(claim.reportSection, "Report"),
    provenance: text(claim.provenance, "AI inference"),
    supportingSourceIds: limitedStrings(claim.supportingSourceIds, 4, []),
    conflictingSourceIds: limitedStrings(claim.conflictingSourceIds, 4, []),
    dimensions: limitedStrings(claim.dimensions, 3, []),
    userCanImproveBy: text(claim.userCanImproveBy, "Add direct supporting evidence."),
  }));

  return {
    executiveSummary: text(seed.executiveSummary, "The concept requires further validation before commitment."),
    scores: dimension.scores,
    market: {
      currency: marketCurrency,
      tamLabel: text(marketSeed.tamLabel, "Total Addressable Market"),
      tamValue: marketFigure(marketCurrency, tam),
      tamCagr: tam > 0 ? percentage(tamCagr) : "Requires validation",
      samLabel: text(marketSeed.samLabel, "Serviceable Addressable Market"),
      samValue: marketFigure(marketCurrency, Number.isFinite(sam) ? sam : 0),
      samCagr: sam > 0 ? percentage(samCagr) : "Requires validation",
      somLabel: text(marketSeed.somLabel, "Serviceable Obtainable Market"),
      somValue: marketFigure(marketCurrency, Number.isFinite(som) ? som : 0),
      somCagr: som > 0 ? percentage(finite(marketSeed.somCagrPct, samCagr)) : "Requires validation",
      growthChart: growthChart(tam, Number.isFinite(sam) ? sam : 0, tamCagr, samCagr),
      assumptionNote: text(marketSeed.assumptionNote, "Market figures are AI-estimated assumptions requiring direct validation."),
    },
    customer: {
      ageLocation: text(customerSeed.ageLocation),
      income: text(customerSeed.income),
      goals: text(customerSeed.goals),
      willingnessToPay: text(customerSeed.willingnessToPay),
      behavior: text(customerSeed.behavior),
    },
    competitors,
    research: {
      overview: text(researchSeed.overview, "Evidence is limited and requires further validation."),
      confidence: ["High", "Medium", "Low"].includes(text(researchSeed.confidence, "Low")) ? text(researchSeed.confidence, "Low") : "Low",
      sentiment: ["Positive", "Mixed", "Negative", "Insufficient data"].includes(text(researchSeed.sentiment, "Insufficient data")) ? text(researchSeed.sentiment, "Insufficient data") : "Insufficient data",
      keySignals: limitedStrings(researchSeed.keySignals, 5, ["Primary market validation is still required."]),
      painPoints: limitedStrings(researchSeed.painPoints, 5, ["Customer pain points require direct validation."]),
      competitorMentions: competitors.map((competitor) => competitor.name),
      redditSignals: limitedStrings(publicResearch.redditSignals, 5, ["Community evidence is limited."]),
      webSignals: limitedStrings(publicResearch.webSignals, 6, ["Public web evidence is limited."]),
    },
    financials: {
      currency,
      projectType,
      capExTotal: { low: capExLow, high: capExHigh, mid: capExMid },
      capEx,
      opEx,
      scenarios,
      investmentRange: `${currency} ${Math.round(investmentLow).toLocaleString("en-US")}–${Math.round(investmentHigh).toLocaleString("en-US")}`,
      breakEvenSummary: `${Math.max(0, Math.round(baseBreakEven))} months`,
      ltvCacRatio: projectType === "commercial" ? text(financialSeed.ltvCacRatio, "Requires validation") : "Not applicable to internal value case",
    },
    risks,
    fundingMix,
    fundingAdvisory: text(seed.fundingAdvisory, "Use phased funding tied to validated evidence and delivery milestones."),
    recommendations: limitedStrings(seed.recommendations, 5, ["Validate the highest-impact assumptions before commitment."]),
    nextSteps: limitedStrings(seed.nextSteps, 4, ["Confirm the accountable owner and validation plan."]),
    inputCompleteness: inputCompleteness(args.inputs, args.inputIssues),
    scoreExplanation: dimension.rows,
    claimEvidenceMap: evidenceClaims,
  };
}
