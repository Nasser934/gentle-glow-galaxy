import type { ConceptInputs, FeasibilityReport } from "@/types/analysis";

export interface ReportDifference {
  changedInputs: string[];
  scoreDelta: number;
  verdictChanged: boolean;
  addedSources: string[];
  removedSources: string[];
  financialChanges: string[];
  addedRisks: string[];
  removedRisks: string[];
  changedRiskLevels: string[];
  scoringVersionMismatch: boolean;
  previousScoringVersion: string;
  nextScoringVersion: string;
}

const comparable = (value: unknown) => JSON.stringify(value ?? null);

const sourceKeys = (report: FeasibilityReport) => new Set(
  (report.sources ?? []).map((source) => source.sourceId || source.url).filter(Boolean),
);

const riskMap = (report: FeasibilityReport) => new Map(
  (report.risks ?? []).map((risk) => [risk.name.trim().toLowerCase(), risk]),
);

export function compareCanonicalReports(
  previous: FeasibilityReport,
  next: FeasibilityReport,
  previousInputs?: ConceptInputs,
  nextInputs?: ConceptInputs,
): ReportDifference {
  const changedInputs = previousInputs && nextInputs
    ? (Object.keys(nextInputs) as Array<keyof ConceptInputs>)
      .filter((key) => comparable(previousInputs[key]) !== comparable(nextInputs[key]))
      .map(String)
    : [];

  const previousSources = sourceKeys(previous);
  const nextSources = sourceKeys(next);
  const addedSources = [...nextSources].filter((source) => !previousSources.has(source));
  const removedSources = [...previousSources].filter((source) => !nextSources.has(source));

  const financialChecks: Array<[string, unknown, unknown]> = [
    ["Currency", previous.financials.currency, next.financials.currency],
    ["Investment range", previous.financials.investmentRange, next.financials.investmentRange],
    ["Break-even", previous.financials.breakEvenSummary, next.financials.breakEvenSummary],
    ["CapEx", previous.financials.capExTotal, next.financials.capExTotal],
    ["OpEx", previous.financials.opEx, next.financials.opEx],
    ["Scenarios", previous.financials.scenarios, next.financials.scenarios],
    ["Funding mix", previous.fundingMix, next.fundingMix],
  ];
  const financialChanges = financialChecks
    .filter(([, before, after]) => comparable(before) !== comparable(after))
    .map(([label]) => label);

  const previousRisks = riskMap(previous);
  const nextRisks = riskMap(next);
  const addedRisks = [...nextRisks.entries()]
    .filter(([name]) => !previousRisks.has(name))
    .map(([, risk]) => risk.name);
  const removedRisks = [...previousRisks.entries()]
    .filter(([name]) => !nextRisks.has(name))
    .map(([, risk]) => risk.name);
  const changedRiskLevels = [...nextRisks.entries()]
    .filter(([name, risk]) => previousRisks.has(name) && previousRisks.get(name)?.level !== risk.level)
    .map(([, risk]) => risk.name);

  const previousScoringVersion = previous.qualityMetadata?.scoringEngineVersion
    ?? previous.scoringAudit?.scoringEngineVersion
    ?? "unrecorded";
  const nextScoringVersion = next.qualityMetadata?.scoringEngineVersion
    ?? next.scoringAudit?.scoringEngineVersion
    ?? "unrecorded";

  return {
    changedInputs,
    scoreDelta: Number((next.scores.overall - previous.scores.overall).toFixed(4)),
    verdictChanged: previous.scores.verdict !== next.scores.verdict,
    addedSources,
    removedSources,
    financialChanges,
    addedRisks,
    removedRisks,
    changedRiskLevels,
    scoringVersionMismatch: previousScoringVersion !== nextScoringVersion,
    previousScoringVersion,
    nextScoringVersion,
  };
}
