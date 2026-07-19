import { parseUnitAwareNumber } from "./numbers.ts";

type RecordLike = Record<string, unknown>;

const DIMENSIONS = ["financial", "market", "achievability", "risk", "timing", "operational"] as const;
type Dimension = typeof DIMENSIONS[number];

const asRecord = (value: unknown): RecordLike =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? value as RecordLike : {};
const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const cleanText = (value: unknown, fallback = "") => typeof value === "string" && value.trim() ? value.trim() : fallback;

function splitItems(value: unknown): string[] {
  return cleanText(value)
    .split(/\n|;|,(?=\s*[A-Za-z])/)
    .map((item) => item.trim().replace(/^[-•]\s*/, ""))
    .filter(Boolean);
}

function currencyFor(inputs: Record<string, string>) {
  const parsedBudget = parseUnitAwareNumber(inputs.budgetRange);
  if (parsedBudget.currency) return parsedBudget.currency;
  const location = `${inputs.location ?? ""} ${inputs.budgetRange ?? ""}`;
  if (/saudi|riyadh|jeddah|ksa|\bsar\b/i.test(location)) return "SAR";
  if (/uae|dubai|abu dhabi|\baed\b/i.test(location)) return "AED";
  if (/united kingdom|\buk\b|\bgbp\b|£/i.test(location)) return "GBP";
  if (/europe|\beur\b|€/i.test(location)) return "EUR";
  return "USD";
}

function isInternalProject(inputs: Record<string, string>) {
  const text = `${inputs.businessModel ?? ""} ${inputs.revenueModel ?? ""} ${inputs.description ?? ""}`;
  return /internal|productivity|cost avoidance|cost saving|employee|workforce|operational efficiency/i.test(text)
    && !/subscription|sales|customer|consumer|marketplace|revenue/i.test(text);
}

function inputCompleteness(inputs: Record<string, string>) {
  const keys = [
    "projectName", "industry", "location", "description", "strategicObjectives", "businessModel",
    "revenueModel", "founderExperience", "budgetRange", "timeline", "teamSize", "dependencies",
    "assumptions", "constraints", "successFactors", "knownRisks", "regulatoryConsiderations",
    "technologyReadiness",
  ];
  return keys.filter((key) => cleanText(inputs[key])).length / keys.length;
}

function score(value: number) {
  return Math.max(0, Math.min(10, Math.round(value * 10) / 10));
}

function dimensionScores(inputs: Record<string, string>, reliableEvidence: boolean) {
  const completeness = inputCompleteness(inputs);
  const common = 4.2 + completeness * 1.8;
  const dimensions: Record<Dimension, { score: number; confidence: number; finding: string; rationale: string }> = {} as Record<Dimension, { score: number; confidence: number; finding: string; rationale: string }>;

  const signals: Record<Dimension, boolean[]> = {
    financial: [Boolean(cleanText(inputs.budgetRange)), Boolean(cleanText(inputs.revenueModel)), Boolean(cleanText(inputs.assumptions))],
    market: [Boolean(cleanText(inputs.industry)), Boolean(cleanText(inputs.location)), reliableEvidence],
    achievability: [Boolean(cleanText(inputs.technologyReadiness)), Boolean(cleanText(inputs.founderExperience)), Boolean(cleanText(inputs.teamSize))],
    risk: [Boolean(cleanText(inputs.knownRisks)), Boolean(cleanText(inputs.regulatoryConsiderations)), Boolean(cleanText(inputs.constraints))],
    timing: [Boolean(cleanText(inputs.timeline)), Boolean(cleanText(inputs.dependencies)), Boolean(cleanText(inputs.successFactors))],
    operational: [Boolean(cleanText(inputs.teamSize)), Boolean(cleanText(inputs.dependencies)), Boolean(cleanText(inputs.successFactors))],
  };

  const labels: Record<Dimension, string> = {
    financial: "Financial assumptions are available but require validation.",
    market: reliableEvidence ? "Public evidence provides partial market context." : "Market evidence is limited and requires validation.",
    achievability: "Delivery feasibility is estimated from the submitted team and technology inputs.",
    risk: "Known risks were converted into a preliminary controlled risk view.",
    timing: "Timing is estimated from the submitted schedule and dependencies.",
    operational: "The operating model is preliminary and needs named ownership.",
  };

  for (const dimension of DIMENSIONS) {
    const present = signals[dimension].filter(Boolean).length;
    const dimensionScore = score(common + (present - 1.5) * 0.45);
    dimensions[dimension] = {
      score: dimensionScore,
      confidence: Math.round(25 + completeness * 25 + (reliableEvidence ? 8 : 0)),
      finding: labels[dimension],
      rationale: "Generated deterministically from user inputs; unsupported assumptions are explicitly marked for validation.",
    };
  }
  return dimensions;
}

function riskRows(inputs: Record<string, string>) {
  const supplied = splitItems(inputs.knownRisks);
  const defaults = [
    "Customer demand may differ from assumptions",
    "Delivery dependencies may delay implementation",
    "Cost estimates may change after supplier validation",
    "Data, privacy, or regulatory requirements may add controls",
    "Operating ownership and adoption may be insufficient",
  ];
  const names = [...supplied, ...defaults].filter((value, index, list) => list.indexOf(value) === index).slice(0, 5);
  while (names.length < 5) names.push(defaults[names.length]);
  return names.map((name) => ({
    name,
    probability: "Med",
    impact: "Med",
    level: "Med",
    mitigation: "Assign an accountable owner, validate the exposure, and define a measurable control before commitment.",
  }));
}

function competitorRows(publicResearch: unknown) {
  const research = asRecord(publicResearch);
  const extracted = asArray(research.competitorScrapes).map(asRecord).flatMap((entry) => {
    const title = cleanText(entry.title) || cleanText(entry.url);
    if (!title) return [];
    return [{
      name: title,
      model: "Competitor-provided information — validate independently",
      weakness: "Not established from current evidence",
      edge: "Requires direct comparative research",
    }];
  }).slice(0, 3);
  const defaults = ["Direct category competitor", "Adjacent solution", "Manual or incumbent alternative"];
  while (extracted.length < 3) extracted.push({
    name: defaults[extracted.length],
    model: "Requires validation",
    weakness: "Requires validation",
    edge: "Requires validation",
  });
  return extracted;
}

function signalStrings(value: unknown, limit: number) {
  return asArray(value).map((item) => cleanText(item)).filter(Boolean).slice(0, limit);
}

function fallbackSeed(inputs: Record<string, string>, publicResearch: unknown, reason: string): RecordLike {
  const research = asRecord(publicResearch);
  const reliableEvidence = research.reliableExternalEvidence === true;
  const webSignals = signalStrings(research.webSignals, 5);
  const communitySignals = signalStrings(research.redditSignals, 3);
  const citations = asArray(research.citations).map(asRecord);
  const currency = currencyFor(inputs);
  const internal = isInternalProject(inputs);
  const risks = riskRows(inputs);
  const description = cleanText(inputs.description, "The submitted concept");
  const projectName = cleanText(inputs.projectName, "This concept");
  const location = cleanText(inputs.location, "the selected market");
  const painPoints = splitItems(inputs.knownRisks).slice(0, 5);
  const firstSourceId = cleanText(citations[0]?.sourceId);

  return {
    executiveSummary: `${projectName} was assessed using the submitted brief, deterministic FMART-O calculations, and the public evidence that could be retrieved. The narrative AI response was unavailable or incomplete (${reason}); therefore missing sections were completed conservatively and unsupported figures are marked for validation.`,
    dimensionScores: dimensionScores(inputs, reliableEvidence),
    market: {
      currency,
      tamLabel: "Total Addressable Market",
      tamValue: 0,
      tamCagrPct: 0,
      samLabel: "Serviceable Addressable Market",
      samValue: 0,
      samCagrPct: 0,
      somLabel: "Serviceable Obtainable Market",
      somValue: 0,
      somCagrPct: 0,
      assumptionNote: "No sufficiently supported market-size figure was available. Add a current primary or reputable industry source.",
    },
    customer: {
      ageLocation: `Target users in ${location}; segment details require validation.`,
      income: "Requires validation through customer discovery.",
      goals: cleanText(inputs.strategicObjectives, description).slice(0, 500),
      willingnessToPay: "Requires direct pricing interviews or transaction evidence.",
      behavior: `Expected behavior inferred from the concept: ${description.slice(0, 300)}`,
    },
    competitors: competitorRows(publicResearch),
    research: {
      overview: reliableEvidence
        ? "Some reliable public evidence was retrieved, but direct support is incomplete for several decision claims."
        : "External evidence is limited. The report relies mainly on user inputs and conservative calculations.",
      confidence: reliableEvidence ? "Medium" : "Low",
      sentiment: "Insufficient data",
      keySignals: [...webSignals, ...communitySignals].slice(0, 5).length
        ? [...webSignals, ...communitySignals].slice(0, 5)
        : ["Primary market and customer evidence is still required."],
      painPoints: painPoints.length ? painPoints : ["Customer pain points require direct validation."],
    },
    financialPlan: {
      currency,
      projectType: internal ? "internal" : "commercial",
      capExItems: [],
      opExItems: [],
      scenarios: [
        { scenario: "Optimistic", probabilityPct: 25, annualValue: 0, adoptionRatePct: 0, volumeAssumption: "Requires validation", breakEvenMonths: 12, basis: "No verified commercial outcome data was available." },
        { scenario: "Base Case", probabilityPct: 50, annualValue: 0, adoptionRatePct: 0, volumeAssumption: "Requires validation", breakEvenMonths: 24, basis: "No verified commercial outcome data was available." },
        { scenario: "Pessimistic", probabilityPct: 25, annualValue: 0, adoptionRatePct: 0, volumeAssumption: "Requires validation", breakEvenMonths: 36, basis: "No verified commercial outcome data was available." },
      ],
      ltvCacRatio: "Requires validation",
    },
    risks,
    funding: [
      { source: "Sponsor or founder funding", sharePct: 40, rationale: "Fund validation and initial implementation in controlled stages." },
      { source: "Strategic or institutional funding", sharePct: 35, rationale: "Release funding after evidence and milestone review." },
      { source: "Contingency or phased funding", sharePct: 25, rationale: "Reserve funding for validated risks and delivery uncertainty." },
    ],
    fundingAdvisory: "Use stage-gated funding. Do not commit the full estimated range until pricing, demand, delivery, and regulatory assumptions are validated.",
    recommendations: [
      "Validate customer demand and willingness to pay with direct interviews or paid pilots.",
      "Obtain supplier quotations and replace estimated costs with approved figures.",
      "Confirm regulatory, privacy, security, and data-hosting requirements.",
      "Assign owners to the highest-impact risks and dependencies.",
      "Re-run the analysis after adding primary evidence and measured pilot results.",
    ],
    nextSteps: [
      "Approve a short evidence-validation plan with owners and due dates.",
      "Collect current market, pricing, customer, and competitor evidence.",
      "Complete a technical and operational proof of concept.",
      "Review the updated report before any irreversible commitment.",
    ],
    evidenceClaims: [
      {
        claimText: `${projectName} is intended for ${location}.`,
        reportSection: "Project Overview",
        provenance: "User input",
        supportingSourceIds: [],
        conflictingSourceIds: [],
        dimensions: ["market", "operational"],
        userCanImproveBy: "Confirm the target segment and location with measurable customer evidence.",
      },
      {
        claimText: `Primary submitted risk: ${risks[0].name}.`,
        reportSection: "Risk Assessment",
        provenance: "User input",
        supportingSourceIds: [],
        conflictingSourceIds: [],
        dimensions: ["risk"],
        userCanImproveBy: "Add an owner, probability basis, impact estimate, and control evidence.",
      },
      ...(firstSourceId ? [{
        claimText: "Public research supplied contextual evidence but does not verify all financial and market assumptions.",
        reportSection: "Research",
        provenance: "Cited source",
        supportingSourceIds: [firstSourceId],
        conflictingSourceIds: [],
        dimensions: ["market"],
        userCanImproveBy: "Add direct primary sources for each material claim.",
      }] : []),
    ],
  };
}

function mergeSeed(fallback: RecordLike, aiSeed: RecordLike): RecordLike {
  const merged: RecordLike = { ...fallback };
  for (const [key, value] of Object.entries(aiSeed)) {
    if (Array.isArray(value)) {
      if (value.length > 0) merged[key] = value;
      continue;
    }
    if (typeof value === "object" && value !== null) {
      merged[key] = mergeSeed(asRecord(fallback[key]), asRecord(value));
      continue;
    }
    if (value !== null && value !== undefined && value !== "") merged[key] = value;
  }
  return merged;
}

export function buildResilientReportSeed(args: {
  inputs: Record<string, string>;
  publicResearch: unknown;
  aiSeed?: Record<string, unknown> | null;
  degradedReason?: string | null;
}) {
  const reason = cleanText(args.degradedReason, "missing structured fields");
  const safeFallback = fallbackSeed(args.inputs, args.publicResearch, reason);
  const aiSeed = asRecord(args.aiSeed);
  return {
    seed: mergeSeed(safeFallback, aiSeed),
    usedFallback: Object.keys(aiSeed).length === 0 || Boolean(args.degradedReason),
    warningCode: args.degradedReason ? `generation_${args.degradedReason}`.replace(/[^a-z0-9_]+/gi, "_").toLowerCase() : null,
  };
}
