import { applyConfidenceCaps } from "./confidence.ts";
import {
  EVIDENCE_METHOD_LABEL,
  assessClaimCoverage,
  estimateEvidenceComposition,
  normalizeClaim,
  type EvidenceClaim,
  type EvidenceSource,
  type SourceQuality,
} from "./evidence.ts";
import { validateFinancialModel } from "./financial.ts";
import { parseUnitAwareNumber, type CurrencyCode } from "./numbers.ts";
import { calculateAuthoritativeScore, FMART_DIMENSIONS, SCORING_ENGINE_VERSION, type LegacyVerdict } from "./scoring.ts";
import { stableSourceId } from "./research.ts";

export const REPORT_SCHEMA_VERSION = "2.0.0";

export interface CanonicalGenerationMetadata {
  modelId: string;
  promptVersion: string;
  inputHash: string;
  generationTimestamp: string;
  researchTimestamp?: string;
  inputOrigins?: Record<string, "user_input" | "ai_suggestion" | "accepted_ai_suggestion" | "edited_after_ai_suggestion">;
  serverInputClassification?: "complete" | "thin";
  inputWarningCodes?: string[];
}

interface MutableReport {
  scores: Record<string, unknown> & {
    overall?: unknown;
    verdict?: unknown;
    weights?: unknown;
    confidence?: unknown;
  };
  research?: {
    citations?: Array<Record<string, unknown>>;
    coverage?: unknown;
    coverageMethod?: unknown;
    coverageMetrics?: unknown;
    reliableExternalEvidence?: unknown;
  };
  financials?: {
    projectType?: unknown;
    currency?: unknown;
    scenarios?: Array<{ annualRevenue?: unknown; annualFinancialBenefit?: unknown; annualValueDisplay?: unknown }>;
  };
  market?: {
    tamValue?: unknown;
    samValue?: unknown;
    growthChart?: Array<{ year?: unknown; tam?: unknown; sam?: unknown }>;
    [key: string]: unknown;
  };
  risks?: Array<{ name?: unknown; level?: unknown; severity?: unknown; impact?: unknown; mitigation?: unknown }>;
  inputQualityScore?: unknown;
  evidenceMix?: unknown;
  claimEvidenceMap?: Array<Record<string, unknown>>;
  scoreExplanation?: Array<Record<string, unknown>>;
  decision?: unknown;
  [key: string]: unknown;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function inputRecord(inputs: object): Record<string, unknown> {
  return inputs as Record<string, unknown>;
}

function estimateInputQuality(inputs: object): number {
  const record = inputRecord(inputs);
  const keys = [
    "projectName", "industry", "description", "strategicObjectives", "businessModel",
    "revenueModel", "founderExperience", "budgetRange", "timeline", "teamSize",
    "dependencies", "assumptions", "constraints", "successFactors", "knownRisks",
    "regulatoryConsiderations", "technologyReadiness",
  ];
  const score = keys.reduce((total, key) => {
    const value = String(record[key] ?? "").trim();
    if (!value) return total;
    return total + (value.split(/\s+/).length >= 3 ? 1 : 0.6);
  }, 0);
  return Math.round(score / keys.length * 100);
}

function domainFor(url: string): string {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}

function safeHttpUrl(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) return "";
  try {
    const url = new URL(raw.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
}

function classifyQuality(source: string, domain: string): SourceQuality {
  const text = `${source} ${domain}`.toLowerCase();
  if (/official|primary source/.test(text)) return "Primary official source";
  if (/government|regulator|\.gov\b|sdaia|central bank|ministry/.test(text)) return "Government or regulator";
  if (/academic|university|institution|\.edu\b/.test(text)) return "Academic or institutional";
  if (/reddit|hacker news|news\.ycombinator/.test(text)) return "Community signal";
  if (/wikipedia|reference/.test(text)) return "General reference";
  if (/mckinsey|gartner|forrester|industry research/.test(text)) return "Reputable industry research";
  if (domain) return "Company source";
  return "Unknown";
}

function stableClaimId(section: string, text: string) {
  const value = `${section}\u0000${text}`;
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `CLM-${(hash >>> 0).toString(16).padStart(8, "0").toUpperCase()}`;
}

function normalizeSources(report: MutableReport, accessDate: string): EvidenceSource[] {
  const usedIds = new Set<string>();
  return (report.research?.citations ?? []).map((citation, index) => {
    const url = safeHttpUrl(citation.url);
    const domain = String(citation.domain ?? "").trim() || domainFor(url);
    const source = String(citation.publisher ?? citation.source ?? "").trim();
    const title = String(citation.title ?? source ?? "Source");
    const baseId = String(citation.sourceId ?? "").trim()
      || stableSourceId(url || `${title}\u0000${index}`);
    let sourceId = baseId;
    let suffix = 2;
    while (usedIds.has(sourceId)) sourceId = `${baseId}-${suffix++}`;
    usedIds.add(sourceId);
    return {
      sourceId,
      title,
      url,
      domain,
      publisher: source || domain || "Unknown",
      publicationDate: citation.publicationDate ? String(citation.publicationDate) : null,
      accessDate: String(citation.accessDate ?? accessDate),
      sourceType: String(citation.sourceType ?? "general"),
      quality: (citation.quality as SourceQuality | undefined) ?? classifyQuality(source, domain),
      stale: citation.stale === true,
    };
  });
}

function convertLegacyClaims(report: MutableReport, sources: EvidenceSource[]): EvidenceClaim[] {
  const sourceLookup = new Map<string, string>();
  for (const source of sources) {
    sourceLookup.set(source.sourceId, source.sourceId);
    sourceLookup.set(source.title, source.sourceId);
    sourceLookup.set(source.publisher, source.sourceId);
    sourceLookup.set(source.url, source.sourceId);
  }
  const legacy = report.claimEvidenceMap ?? [];
  const sectionDimension: Record<string, "financial" | "market" | "achievability" | "risk" | "timing" | "operational"> = {
    "Financial Plan": "financial",
    "Market Analysis": "market",
    "Competitive Landscape": "market",
    "Achievability": "achievability",
    "Risk Assessment": "risk",
    "Timing": "timing",
    "Operational": "operational",
  };
  const usedClaimIds = new Set<string>();
  const converted = legacy.map((claim) => {
    const claimText = String(claim.claimText ?? "Claim requires validation.");
    const reportSection = String(claim.reportSection ?? "Report");
    const explicitSupporting = Array.isArray(claim.supportingSourceIds) ? claim.supportingSourceIds.map(String) : [];
    const listed = explicitSupporting.length > 0
      ? explicitSupporting
      : Array.isArray(claim.sources) ? claim.sources.map(String) : [];
    const supportingSourceIds = listed.map((value) => sourceLookup.get(value)).filter((value): value is string => value !== undefined);
    const conflictingSourceIds = (Array.isArray(claim.conflictingSourceIds) ? claim.conflictingSourceIds.map(String) : [])
      .map((value) => sourceLookup.get(value))
      .filter((value): value is string => value !== undefined);
    const user = Number(claim.userInputPercent ?? 0);
    const rawCited = Number(claim.webResearchPercent ?? 0);
    const calculation = Number(claim.calculationPercent ?? 0);
    const rawAi = Number(claim.aiAssumptionPercent ?? 0);
    const hasMappedEvidence = supportingSourceIds.length > 0 || conflictingSourceIds.length > 0;
    const cited = hasMappedEvidence ? rawCited : 0;
    const ai = rawAi + (hasMappedEvidence || !Number.isFinite(rawCited) ? 0 : Math.max(0, rawCited));
    const declaredProvenance = String(claim.provenance ?? "");
    const declaredIsValid = ["User input", "Cited source", "Calculation", "AI inference", "Mixed", "Unknown"].includes(declaredProvenance);
    const provenance = hasMappedEvidence && declaredIsValid
      ? declaredProvenance as "User input" | "Cited source" | "Calculation" | "AI inference" | "Mixed" | "Unknown"
      : hasMappedEvidence
        ? (user > 0 || ai > 0 ? "Mixed" as const : "Cited source" as const)
        : declaredProvenance === "User input" && user > 0
          ? "User input" as const
          : declaredProvenance === "Calculation" && calculation > 0 && ai <= 0
            ? "Calculation" as const
            : user > 0 || calculation > 0
              ? "Mixed" as const
              : "AI inference" as const;
    const proposedId = String(claim.claimId ?? "").trim();
    const baseClaimId = /^[A-Za-z0-9_-]{6,80}$/.test(proposedId) ? proposedId : stableClaimId(reportSection, claimText);
    let claimId = baseClaimId;
    let suffix = 2;
    while (usedClaimIds.has(claimId)) claimId = `${baseClaimId}-${suffix++}`;
    usedClaimIds.add(claimId);
    return normalizeClaim({
      claimId,
      claimText,
      reportSection,
      provenance,
      supportingSourceIds,
      conflictingSourceIds,
      dimensions: Array.isArray(claim.dimensions)
        ? claim.dimensions.filter((value): value is "financial" | "market" | "achievability" | "risk" | "timing" | "operational" =>
            ["financial", "market", "achievability", "risk", "timing", "operational"].includes(String(value)))
        : sectionDimension[reportSection]
          ? [sectionDimension[reportSection]]
          : [],
      composition: {
        userInputPercent: user,
        citedSourcePercent: cited,
        calculationPercent: calculation,
        aiInferencePercent: ai,
      },
      displayStatus: conflictingSourceIds.length > 0
        ? "Conflicting evidence — requires review"
        : supportingSourceIds.length > 0
          ? "Supported by cited source"
          : provenance === "Calculation"
            ? "Calculated"
            : "AI-estimated assumption — not externally verified",
    });
  });

  const firstScenario = report.financials?.scenarios?.[0];
  const firstScenarioOutcome = firstScenario?.annualFinancialBenefit
    ?? firstScenario?.annualRevenue
    ?? firstScenario?.annualValueDisplay;
  const hasPreciseOutcome = (typeof firstScenarioOutcome === "string" && firstScenarioOutcome.trim().length > 0)
    || (typeof firstScenarioOutcome === "number" && Number.isFinite(firstScenarioOutcome));
  const internal = String(report.financials?.projectType ?? "").toLowerCase() === "internal";
  const financialClaim = normalizeClaim({
    claimId: "CLM-FIN-OUTCOME",
    claimText: hasPreciseOutcome
      ? `${internal ? "Year-1 internal financial benefit" : "Year-1 financial outcome"} assumption: ${firstScenarioOutcome}.`
      : `${internal ? "Year-1 internal financial benefit" : "Year-1 financial outcome"} requires validation.`,
    reportSection: "Financial Plan",
    provenance: "AI inference",
    supportingSourceIds: [],
    conflictingSourceIds: [],
    dimensions: ["financial"],
    displayStatus: hasPreciseOutcome ? "AI-estimated assumption — not externally verified" : "Requires validation",
  });
  const fallbackClaims: EvidenceClaim[] = [];
  if (!converted.some((claim) => claim.dimensions?.includes("market"))) {
    const tamValue = String(report.market?.tamValue ?? "").trim();
    fallbackClaims.push(normalizeClaim({
      claimId: "CLM-MARKET-SIZE",
      claimText: tamValue ? `Total addressable market assumption: ${tamValue}.` : "Market size requires validation.",
      reportSection: "Market Analysis",
      provenance: "AI inference",
      supportingSourceIds: [],
      conflictingSourceIds: [],
      dimensions: ["market"],
      displayStatus: tamValue ? "AI-estimated assumption — not externally verified" : "Requires validation",
    }));
  }
  if (!converted.some((claim) => claim.dimensions?.includes("risk"))) {
    const primaryRisk = report.risks?.[0];
    fallbackClaims.push(normalizeClaim({
      claimId: "CLM-RISK-PRIMARY",
      claimText: primaryRisk?.name
        ? `Primary modeled risk: ${String(primaryRisk.name)} (${String(primaryRisk.level ?? "requires validation")}).`
        : "Primary project risk requires validation.",
      reportSection: "Risk Assessment",
      provenance: "AI inference",
      supportingSourceIds: [],
      conflictingSourceIds: [],
      dimensions: ["risk"],
      displayStatus: "AI-estimated assumption — not externally verified",
    }));
  }
  return [
    ...converted.filter((claim) => ![financialClaim.claimId, "CLM-FIN-REVENUE"].includes(claim.claimId)),
    ...fallbackClaims,
    financialClaim,
  ];
}

function consumerVerdict(verdict: LegacyVerdict, hasOverrides: boolean): string {
  if (verdict === "PROCEED WITH CAUTION") return hasOverrides ? "CONDITIONAL PROCEED WITH VALIDATION" : "CONDITIONAL PROCEED";
  return verdict;
}

function normalizedFigure(
  raw: unknown,
  status: "Verified from user input" | "Supported by cited source" | "Calculated" | "AI estimate" | "Requires validation",
  label: string,
  currencyOverride?: string,
) {
  const parsed = parseUnitAwareNumber(raw);
  const currency = parsed.currency ?? (
    ["SAR", "USD", "AED", "EUR", "GBP"].includes(String(currencyOverride).toUpperCase())
      ? String(currencyOverride).toUpperCase() as CurrencyCode
      : null
  );
  return {
    value: parsed.value,
    low: parsed.low,
    high: parsed.high,
    currency,
    unit: parsed.unit,
    displayText: parsed.displayText,
    status: parsed.valid ? status : "Requires validation" as const,
    label: parsed.valid ? label : "Requires validation",
  };
}

function normalizeGrowthChartScale(market: MutableReport["market"]) {
  const chart = market?.growthChart;
  if (!market || !Array.isArray(chart) || chart.length === 0) return false;
  const first = chart.find((point) => Number(point.tam) > 0 || Number(point.sam) > 0);
  if (!first) return false;

  const scaleFor = (targetRaw: unknown, chartRaw: unknown) => {
    const target = parseUnitAwareNumber(targetRaw).value;
    const chartValue = Number(chartRaw);
    if (target === null || target <= 0 || !Number.isFinite(chartValue) || chartValue <= 0) return 1;
    const ratio = target / chartValue;
    const candidates = [1_000, 1_000_000, 1_000_000_000, 1_000_000_000_000];
    return candidates.find((candidate) => Math.abs(Math.log10(ratio / candidate)) <= 0.12) ?? 1;
  };

  const tamScale = scaleFor(market.tamValue, first.tam);
  const samScale = scaleFor(market.samValue, first.sam);
  if (tamScale === 1 && samScale === 1) return false;
  market.growthChart = chart.map((point) => ({
    ...point,
    tam: Number.isFinite(Number(point.tam)) ? Number(point.tam) * tamScale : 0,
    sam: Number.isFinite(Number(point.sam)) ? Number(point.sam) * samScale : 0,
  }));
  return true;
}

export function buildCanonicalReport<T extends object>(
  sourceReport: T,
  inputs: object,
  metadata: CanonicalGenerationMetadata,
): T & {
  validationStatus: "valid" | "valid_with_warnings";
  validationWarnings: Array<{ code: string; message: string; path?: string }>;
  scoringAudit: ReturnType<typeof calculateAuthoritativeScore>["audit"];
  sources: EvidenceSource[];
  claims: EvidenceClaim[];
  qualityMetadata: {
    validationStatus: "valid" | "valid_with_warnings";
    validationWarnings: string[];
    scoringEngineVersion: string;
    promptVersion: string;
    modelId: string;
    reportSchemaVersion: string;
    inputHash: string;
    generationTimestamp: string;
    researchTimestamp: string;
    sourceCount: number;
    primarySourceCount: number;
    unsupportedClaimCount: number;
    financialWarningCount: number;
  };
} {
  const report = clone(sourceReport) as unknown as MutableReport;
  if (!report.scores || typeof report.scores !== "object") throw new Error("Report scores are missing");
  const input = inputRecord(inputs);
  const deterministicInputQuality = estimateInputQuality(inputs);
  const modelInputQuality = typeof report.inputQualityScore === "number" && Number.isFinite(report.inputQualityScore)
    ? report.inputQualityScore
    : deterministicInputQuality;
  const inputQuality = Math.max(0, Math.min(
    modelInputQuality,
    deterministicInputQuality,
    metadata.serverInputClassification === "thin" ? 55 : 90,
  ));
  const sources = normalizeSources(report, metadata.generationTimestamp.slice(0, 10));
  const claims = convertLegacyClaims(report, sources);
  const claimCoverage = assessClaimCoverage(sources, claims);
  if (report.research) {
    report.research.coverage = claimCoverage.coverage;
    report.research.reliableExternalEvidence = claimCoverage.reliableExternalEvidence;
    report.research.coverageMethod = "Source quality, recency, relevance, explicit claim support, and independent domains.";
    report.research.coverageMetrics = {
      reliableSourceCount: claimCoverage.reliableSourceCount,
      independentReliableDomains: claimCoverage.independentReliableDomains,
      currentSourceCount: claimCoverage.currentSourceCount,
      directClaimSupportCount: claimCoverage.directClaimSupportCount,
    };
  }
  const marketDirectSourceCount = claims
    .filter((claim) => claim.dimensions?.includes("market"))
    .reduce((ids, claim) => new Set([...ids, ...claim.supportingSourceIds]), new Set<string>()).size;
  const primarySourceCount = sources.filter((source) =>
    ["Primary official source", "Government or regulator", "Academic or institutional"].includes(source.quality),
  ).length;
  const financialValidation = validateFinancialModel(report);
  const marketRecord = (report.market ?? {}) as Record<string, unknown>;
  const marketChartScaleNormalized = normalizeGrowthChartScale(report.market);
  const financialRecord = (report.financials ?? {}) as Record<string, unknown>;
  const financialCurrency = String(financialRecord.currency ?? marketRecord.currency ?? "");
  const capExTotal = (financialRecord.capExTotal ?? {}) as Record<string, unknown>;
  const normalizedFigures: Record<string, ReturnType<typeof normalizedFigure>> = {
    tam: normalizedFigure(marketRecord.tamValue, "AI estimate", "AI-estimated range — requires validation", financialCurrency),
    sam: normalizedFigure(marketRecord.samValue, "AI estimate", "AI-estimated range — requires validation", financialCurrency),
    som: normalizedFigure(marketRecord.somValue, "AI estimate", "AI-estimated range — requires validation", financialCurrency),
    capExLow: normalizedFigure(capExTotal.low, "Calculated", "Calculated from estimated line items — requires validation", financialCurrency),
    capExHigh: normalizedFigure(capExTotal.high, "Calculated", "Calculated from estimated line items — requires validation", financialCurrency),
    capExMid: normalizedFigure(capExTotal.mid, "Calculated", "Calculated midpoint from estimated line items", financialCurrency),
    monthlyOpEx: normalizedFigure(financialValidation.normalized.monthlyOpEx, "Calculated", "Calculated from monthly line items — requires validation", financialCurrency),
    annualOpEx: normalizedFigure(financialValidation.normalized.annualOpEx, "Calculated", "Calculated as monthly OpEx × 12", financialCurrency),
    investmentRange: normalizedFigure(
      financialRecord.investmentRange,
      financialValidation.warnings.some((warning) => warning.code === "investment_range_inconsistent") ? "Requires validation" : "Calculated",
      financialValidation.warnings.some((warning) => warning.code === "investment_range_inconsistent")
        ? "Requires validation"
        : "Calculated from CapEx and six months of operating runway",
      financialCurrency,
    ),
    breakEven: normalizedFigure(financialRecord.breakEvenSummary, "AI estimate", "AI-estimated assumption — not externally verified"),
  };
  const scenarios = Array.isArray(financialRecord.scenarios) ? financialRecord.scenarios as Array<Record<string, unknown>> : [];
  for (const [index, scenario] of scenarios.entries()) {
    const outcome = scenario.annualFinancialBenefit ?? scenario.annualRevenue ?? scenario.annualValueDisplay;
    normalizedFigures[`scenario${index + 1}Outcome`] = normalizedFigure(
      outcome,
      "AI estimate",
      "AI-estimated assumption — not externally verified",
      financialCurrency,
    );
  }
  const confidence = applyConfidenceCaps(report.scores.confidence, {
    inputCompleteness: inputQuality,
    marketDirectSourceCount,
    primarySourceCount,
    hasPricingOrFinancialAssumptions: Boolean(String(input.revenueModel ?? "").trim() || String(input.assumptions ?? "").trim()),
    hasTeamExperience: Boolean(String(input.founderExperience ?? "").trim()),
    isRegulatedSector: /health|financial|government|energy|telecom/i.test(String(input.industry ?? "")),
    hasRegulatoryInput: Boolean(String(input.regulatoryConsiderations ?? "").trim()),
    unsupportedCalculationCount: financialValidation.warnings.length,
    contradictoryInputCount: (() => {
      if (Array.isArray(report.inputCompleteness)) return 0;
      const contradictoryFields = (report.inputCompleteness as Record<string, unknown> | undefined)?.contradictoryFields;
      if (Array.isArray(contradictoryFields)) return contradictoryFields.length;
      if (contradictoryFields && typeof contradictoryFields === "object") return Object.keys(contradictoryFields).length;
      return contradictoryFields ? 1 : 0;
    })(),
  });
  const unmitigatedCriticalRisk = (report.risks ?? []).some((risk) => {
    const criticalSignal = [risk.level, risk.name, risk.severity, risk.impact]
      .map((value) => String(value ?? ""))
      .join(" ");
    return /critical/i.test(criticalSignal) && String(risk.mitigation ?? "").trim().length < 8;
  });
  const modelProposedOverall = report.scores.overall;
  const modelProposedVerdict = report.scores.verdict;
  const score = calculateAuthoritativeScore({
    scores: report.scores,
    modelWeights: report.scores.weights,
    industry: String(input.industry ?? ""),
    modelProposedOverall,
    modelProposedVerdict,
    governance: {
      overallConfidencePct: confidence.average,
      inputQuality,
      hasUnmitigatedCriticalRisk: unmitigatedCriticalRisk,
      hasFinancialValidationBlocker: financialValidation.warnings.length > 0,
    },
  });
  claims.push(normalizeClaim({
    claimId: "CLM-SCORE-AUTHORITATIVE",
    claimText: `Server-calculated FMART-O score: ${score.displayScore.toFixed(1)} out of 10.`,
    reportSection: "FMART-O Scorecard",
    provenance: "Calculation",
    supportingSourceIds: [],
    conflictingSourceIds: [],
    dimensions: [...FMART_DIMENSIONS],
    displayStatus: "Calculated",
  }));

  report.scores = {
    ...report.scores,
    ...score.scores,
    overall: score.finalAuthoritativeScore,
    verdict: score.verdict,
    weights: score.weights,
    confidence: confidence.values,
    audit: score.audit,
  };
  if (Array.isArray(report.scoreExplanation)) {
    report.scoreExplanation = report.scoreExplanation.map((row) => {
      const dimension = String(row.dimension ?? "");
      return FMART_DIMENSIONS.includes(dimension as typeof FMART_DIMENSIONS[number])
        ? { ...row, score: score.scores[dimension as typeof FMART_DIMENSIONS[number]] }
        : row;
    });
  }

  const composition = estimateEvidenceComposition({ inputQuality, sources });
  report.inputQualityScore = inputQuality;
  report.inputOrigins = metadata.inputOrigins ?? {};
  report.evidenceMix = {
    userInputPercent: composition.userInputPercent,
    webResearchPercent: composition.citedSourcePercent,
    calculationPercent: composition.calculationPercent,
    aiAssumptionPercent: composition.aiInferencePercent,
    label: "Estimated Evidence Composition",
    method: EVIDENCE_METHOD_LABEL,
  };
  report.claimEvidenceMap = claims.map((claim) => ({
    claimId: claim.claimId,
    claimText: claim.claimText,
    reportSection: claim.reportSection,
    provenance: claim.provenance,
    supportingSourceIds: claim.supportingSourceIds,
    conflictingSourceIds: claim.conflictingSourceIds,
    dimensions: claim.dimensions,
    supportStatus: claim.supportStatus,
    userInputPercent: claim.composition.userInputPercent,
    webResearchPercent: claim.composition.citedSourcePercent,
    calculationPercent: claim.composition.calculationPercent,
    aiAssumptionPercent: claim.composition.aiInferencePercent,
    sources: claim.supportingSourceIds,
    confidence: claim.supportStatus === "supported" ? "Medium" : "Low",
    userCanImproveBy: claim.supportStatus === "supported" ? "Review the linked source." : "Add user inputs or a direct supporting source.",
    displayStatus: claim.displayStatus,
  }));
  report.decision = {
    verdict: consumerVerdict(score.verdict, score.overrideReasons.length > 0),
    recommendationLabel: score.verdict === "PROCEED"
      ? "Proceed"
      : score.verdict === "PROCEED WITH CAUTION"
        ? "Proceed with caution · Needs validation"
        : score.verdict === "REVISE"
          ? "Revise before commitment"
          : "Do not proceed",
    nextStepHint: score.verdict === "REVISE" ? "Address the identified blockers, then run a new version." : "Validate assumptions before commitment.",
    blockers: score.overrideReasons.map((reason) => reason.replace(/_/g, " ")),
    overallConfidencePct: Math.round(confidence.average),
  };

  const inputWarningCodes = [
    ...(metadata.inputWarningCodes ?? []),
    ...(marketChartScaleNormalized ? ["market_chart_scale_normalized"] : []),
  ];
  const validationStatus = financialValidation.valid && inputWarningCodes.length === 0 ? "valid" as const : "valid_with_warnings" as const;
  const unsupportedClaimCount = claims.filter((claim) =>
    claim.supportStatus === "ai_inference"
    || (claim.supportStatus === "unsupported" && !["Calculation", "User input"].includes(claim.provenance)),
  ).length;
  const qualityMetadata = {
    validationStatus,
    validationWarnings: [...financialValidation.warnings.map((warning) => warning.code), ...inputWarningCodes],
    scoringEngineVersion: SCORING_ENGINE_VERSION,
    promptVersion: metadata.promptVersion,
    modelId: metadata.modelId,
    reportSchemaVersion: REPORT_SCHEMA_VERSION,
    inputHash: metadata.inputHash,
    generationTimestamp: metadata.generationTimestamp,
    researchTimestamp: metadata.researchTimestamp ?? metadata.generationTimestamp,
    sourceCount: sources.length,
    primarySourceCount,
    unsupportedClaimCount,
    financialWarningCount: financialValidation.warnings.length,
  };
  report.validationStatus = validationStatus;
  report.validationWarnings = [
    ...financialValidation.warnings,
    ...inputWarningCodes.map((code) => ({ code, message: "Input detail requires validation before commitment.", path: "inputs" })),
  ];
  report.scoringAudit = score.audit;
  report.sources = sources;
  report.claims = claims;
  report.normalizedFigures = normalizedFigures;
  report.qualityMetadata = qualityMetadata;
  report.reportSchemaVersion = REPORT_SCHEMA_VERSION;

  return report as unknown as T & {
    validationStatus: "valid" | "valid_with_warnings";
    validationWarnings: Array<{ code: string; message: string; path?: string }>;
    scoringAudit: ReturnType<typeof calculateAuthoritativeScore>["audit"];
    sources: EvidenceSource[];
    claims: EvidenceClaim[];
    qualityMetadata: typeof qualityMetadata;
  };
}
