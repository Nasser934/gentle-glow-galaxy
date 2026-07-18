export const EVIDENCE_METHOD_LABEL = "Heuristic estimate based on input completeness and available sources.";

export type ClaimProvenance = "User input" | "Cited source" | "Calculation" | "AI inference" | "Mixed" | "Unknown";
export type SourceQuality =
  | "Primary official source"
  | "Government or regulator"
  | "Academic or institutional"
  | "Company source"
  | "Reputable industry research"
  | "Community signal"
  | "General reference"
  | "Unknown";

export interface EvidenceSource {
  sourceId: string;
  title: string;
  url: string;
  domain: string;
  publisher: string;
  publicationDate?: string | null;
  accessDate: string;
  sourceType: string;
  quality: SourceQuality;
  stale?: boolean;
}

export interface EvidenceComposition {
  userInputPercent: number;
  citedSourcePercent: number;
  calculationPercent: number;
  aiInferencePercent: number;
}

export interface EvidenceClaimInput {
  claimId: string;
  claimText: string;
  reportSection: string;
  provenance: ClaimProvenance;
  supportingSourceIds: string[];
  conflictingSourceIds: string[];
  dimensions?: Array<"financial" | "market" | "achievability" | "risk" | "timing" | "operational">;
  composition?: Partial<EvidenceComposition>;
  displayStatus?: string;
}

export interface EvidenceClaim extends Omit<EvidenceClaimInput, "composition"> {
  composition: EvidenceComposition;
  supportStatus: "supported" | "conflicting" | "unsupported" | "ai_inference";
}

function nonNegative(raw: unknown): number {
  const value = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function normalizeComposition(input: Partial<EvidenceComposition> | null | undefined): EvidenceComposition {
  const values = [
    nonNegative(input?.userInputPercent),
    nonNegative(input?.citedSourcePercent),
    nonNegative(input?.calculationPercent),
    nonNegative(input?.aiInferencePercent),
  ];
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return { userInputPercent: 0, citedSourcePercent: 0, calculationPercent: 0, aiInferencePercent: 100 };
  }
  const first = Math.round(values[0] * 100 / total);
  const second = Math.round(values[1] * 100 / total);
  const third = Math.round(values[2] * 100 / total);
  const fourth = Math.max(0, 100 - first - second - third);
  return { userInputPercent: first, citedSourcePercent: second, calculationPercent: third, aiInferencePercent: fourth };
}

export function estimateEvidenceComposition(args: { inputQuality: number; sources: EvidenceSource[] }): EvidenceComposition {
  const quality = Math.max(0, Math.min(100, Number.isFinite(args.inputQuality) ? args.inputQuality : 0));
  const domains = new Set(args.sources.map((source) => source.domain.toLowerCase()).filter(Boolean)).size;
  const highQuality = args.sources.filter((source) =>
    ["Primary official source", "Government or regulator", "Academic or institutional"].includes(source.quality),
  ).length;
  let userInputPercent = Math.round(quality * 0.45);
  let citedSourcePercent = Math.min(35, domains * 8 + highQuality * 4);
  let calculationPercent = quality >= 60 ? 10 : 5;
  const availableForEvidence = 95;
  const subtotal = userInputPercent + citedSourcePercent + calculationPercent;
  if (subtotal > availableForEvidence) {
    const factor = availableForEvidence / subtotal;
    userInputPercent = Math.round(userInputPercent * factor);
    citedSourcePercent = Math.round(citedSourcePercent * factor);
    calculationPercent = Math.max(0, availableForEvidence - userInputPercent - citedSourcePercent);
  }
  const aiInferencePercent = 100 - userInputPercent - citedSourcePercent - calculationPercent;
  return normalizeComposition({ userInputPercent, citedSourcePercent, calculationPercent, aiInferencePercent });
}

function defaultComposition(provenance: ClaimProvenance): EvidenceComposition {
  switch (provenance) {
    case "User input": return { userInputPercent: 100, citedSourcePercent: 0, calculationPercent: 0, aiInferencePercent: 0 };
    case "Cited source": return { userInputPercent: 0, citedSourcePercent: 100, calculationPercent: 0, aiInferencePercent: 0 };
    case "Calculation": return { userInputPercent: 0, citedSourcePercent: 0, calculationPercent: 100, aiInferencePercent: 0 };
    case "AI inference": return { userInputPercent: 0, citedSourcePercent: 0, calculationPercent: 0, aiInferencePercent: 100 };
    case "Mixed": return { userInputPercent: 25, citedSourcePercent: 25, calculationPercent: 25, aiInferencePercent: 25 };
    case "Unknown": return { userInputPercent: 0, citedSourcePercent: 0, calculationPercent: 0, aiInferencePercent: 100 };
  }
}

export function normalizeClaim(input: EvidenceClaimInput): EvidenceClaim {
  let composition = normalizeComposition(input.composition ?? defaultComposition(input.provenance));
  if ((input.provenance === "AI inference" || input.provenance === "Unknown") && composition.aiInferencePercent === 0) {
    composition = normalizeComposition({ ...composition, aiInferencePercent: 1 });
  }
  const supportStatus = input.conflictingSourceIds.length > 0
    ? "conflicting"
    : input.supportingSourceIds.length > 0
      ? "supported"
      : input.provenance === "AI inference"
        ? "ai_inference"
        : "unsupported";
  return { ...input, composition, supportStatus };
}

export function mapClaimsToSources(claims: EvidenceClaim[], sources: EvidenceSource[]) {
  const sourceById = new Map(sources.map((source) => [source.sourceId, source]));
  return claims.map((claim) => {
    const supportingSources = claim.supportingSourceIds.map((sourceId) => sourceById.get(sourceId)).filter((source): source is EvidenceSource => source !== undefined);
    const conflictingSources = claim.conflictingSourceIds.map((sourceId) => sourceById.get(sourceId)).filter((source): source is EvidenceSource => source !== undefined);
    const supportStatus = conflictingSources.length > 0
      ? "conflicting"
      : supportingSources.length > 0
        ? "supported"
        : claim.provenance === "AI inference"
          ? "ai_inference"
          : "unsupported";
    return { ...claim, supportStatus, supportingSources, conflictingSources };
  });
}

/**
 * Final report coverage is claim-aware: an impressive source list is not
 * sufficient unless reliable sources are explicitly linked to major claims.
 */
export function assessClaimCoverage(sources: EvidenceSource[], claims: EvidenceClaim[]) {
  const sourceById = new Map(sources.map((source) => [source.sourceId, source]));
  const directClaims = claims.filter((claim) =>
    claim.supportingSourceIds.some((sourceId) => sourceById.has(sourceId)),
  );
  const linkedIds = new Set(directClaims.flatMap((claim) => claim.supportingSourceIds));
  const reliableQualities = new Set<SourceQuality>([
    "Primary official source",
    "Government or regulator",
    "Academic or institutional",
    "Reputable industry research",
  ]);
  const reliableLinkedSources = [...linkedIds]
    .map((sourceId) => sourceById.get(sourceId))
    .filter((source): source is EvidenceSource =>
      source !== undefined && reliableQualities.has(source.quality) && source.stale !== true,
    );
  const independentReliableDomains = new Set(reliableLinkedSources.map((source) => source.domain).filter(Boolean)).size;
  const currentSourceCount = sources.filter((source) => source.stale !== true).length;
  const hasNonCommunitySource = sources.some((source) => source.quality !== "Community signal");
  const coverage = directClaims.length >= 3 && reliableLinkedSources.length >= 4 && independentReliableDomains >= 3
    ? "Sufficient" as const
    : directClaims.length >= 1 && reliableLinkedSources.length >= 2 && independentReliableDomains >= 2
      ? "Partial" as const
      : hasNonCommunitySource
        ? "Limited" as const
        : "No reliable external evidence" as const;

  return {
    coverage,
    reliableExternalEvidence: reliableLinkedSources.length > 0,
    reliableSourceCount: reliableLinkedSources.length,
    independentReliableDomains,
    currentSourceCount,
    directClaimSupportCount: directClaims.length,
  };
}
