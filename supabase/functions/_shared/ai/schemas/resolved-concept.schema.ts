export const RESOLVED_CONCEPT_VERSION = "resolved-concept.v1" as const;

export interface CandidateScenario {
  id: string;
  name: string;
  description: string;
  targetCustomer: string;
  targetGeography: string;
  businessModel: string;
  revenueModel: string;
  evidenceStrength: number;
  sourceIds: string[];
  advantages: string[];
  limitations: string[];
}

export interface SelectedBaselineScenario {
  id: string;
  name: string;
  description: string;
  productCategory: string;
  customerProblem: string;
  targetCustomer: string;
  targetGeography: string;
  valueProposition: string;
  businessModel: string;
  revenueModel: string;
  pricingApproach: string;
  operatingModel: string;
  technologyApproach: string;
  regulatoryScope: string;
  costProfile: string;
  commercialUnit: string;
  sourceIds: string[];
}

export interface ResolvedConcept {
  version: typeof RESOLVED_CONCEPT_VERSION;
  resolutionStatus: "resolved" | "partially_resolved";
  originalBriefSummary: string;
  candidateScenarios: CandidateScenario[];
  selectedBaselineScenario: SelectedBaselineScenario;
  selectionRationale: string;
  resolvedPublicFacts: Array<{
    field: string;
    value: string;
    sourceIds: string[];
    confidence: number;
  }>;
  explicitAssumptions: Array<{
    field: string;
    value: string;
    reason: string;
    impact: "low" | "medium" | "high";
  }>;
  unresolvedPrivateDecisions: Array<{
    field: string;
    reason: string;
    decisionImpact: "low" | "medium" | "high";
    userAction: string;
  }>;
  confidence: number;
}

const impactEnum = ["low", "medium", "high"] as const;

export const resolvedConceptSchema = {
  type: "object",
  properties: {
    version: { type: "string", enum: [RESOLVED_CONCEPT_VERSION] },
    resolutionStatus: { type: "string", enum: ["resolved", "partially_resolved"] },
    originalBriefSummary: { type: "string" },
    candidateScenarios: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
          targetCustomer: { type: "string" },
          targetGeography: { type: "string" },
          businessModel: { type: "string" },
          revenueModel: { type: "string" },
          evidenceStrength: { type: "number", minimum: 0, maximum: 100 },
          sourceIds: { type: "array", items: { type: "string" } },
          advantages: { type: "array", items: { type: "string" } },
          limitations: { type: "array", items: { type: "string" } },
        },
        required: [
          "id", "name", "description", "targetCustomer", "targetGeography",
          "businessModel", "revenueModel", "evidenceStrength", "sourceIds",
          "advantages", "limitations",
        ],
        additionalProperties: false,
      },
    },
    selectedBaselineScenario: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        description: { type: "string" },
        productCategory: { type: "string" },
        customerProblem: { type: "string" },
        targetCustomer: { type: "string" },
        targetGeography: { type: "string" },
        valueProposition: { type: "string" },
        businessModel: { type: "string" },
        revenueModel: { type: "string" },
        pricingApproach: { type: "string" },
        operatingModel: { type: "string" },
        technologyApproach: { type: "string" },
        regulatoryScope: { type: "string" },
        costProfile: { type: "string" },
        commercialUnit: { type: "string" },
        sourceIds: { type: "array", items: { type: "string" } },
      },
      required: [
        "id", "name", "description", "productCategory", "customerProblem",
        "targetCustomer", "targetGeography", "valueProposition", "businessModel",
        "revenueModel", "pricingApproach", "operatingModel",
        "technologyApproach", "regulatoryScope", "costProfile",
        "commercialUnit", "sourceIds",
      ],
      additionalProperties: false,
    },
    selectionRationale: { type: "string" },
    resolvedPublicFacts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          field: { type: "string" },
          value: { type: "string" },
          sourceIds: { type: "array", items: { type: "string" } },
          confidence: { type: "number", minimum: 0, maximum: 100 },
        },
        required: ["field", "value", "sourceIds", "confidence"],
        additionalProperties: false,
      },
    },
    explicitAssumptions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          field: { type: "string" },
          value: { type: "string" },
          reason: { type: "string" },
          impact: { type: "string", enum: impactEnum },
        },
        required: ["field", "value", "reason", "impact"],
        additionalProperties: false,
      },
    },
    unresolvedPrivateDecisions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          field: { type: "string" },
          reason: { type: "string" },
          decisionImpact: { type: "string", enum: impactEnum },
          userAction: { type: "string" },
        },
        required: ["field", "reason", "decisionImpact", "userAction"],
        additionalProperties: false,
      },
    },
    confidence: { type: "number", minimum: 0, maximum: 100 },
  },
  required: [
    "version", "resolutionStatus", "originalBriefSummary", "candidateScenarios",
    "selectedBaselineScenario", "selectionRationale", "resolvedPublicFacts",
    "explicitAssumptions", "unresolvedPrivateDecisions", "confidence",
  ],
  additionalProperties: false,
} as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const requiredString = (
  record: Record<string, unknown>,
  key: string,
  path: string,
): string => {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${path}.${key} must be a non-empty string.`);
  }
  return value.trim();
};

const boundedNumber = (value: unknown, path: string): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new Error(`${path} must be between 0 and 100.`);
  }
  return parsed;
};

const stringArray = (value: unknown, path: string): string[] => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${path} must be an array of strings.`);
  }
  return value.map((item) => item.trim()).filter(Boolean);
};

const validateSourceIds = (
  sourceIds: string[],
  allowedSourceIds: ReadonlySet<string>,
  path: string,
) => {
  for (const sourceId of sourceIds) {
    if (!allowedSourceIds.has(sourceId)) {
      throw new Error(`${path} references unknown research source ${sourceId}.`);
    }
  }
};

export function validateResolvedConcept(
  value: unknown,
  allowedSourceIds: ReadonlySet<string>,
): ResolvedConcept {
  if (!isRecord(value)) throw new Error("Resolved concept must be an object.");
  if (value.version !== RESOLVED_CONCEPT_VERSION) {
    throw new Error(`Resolved concept version must be ${RESOLVED_CONCEPT_VERSION}.`);
  }
  if (value.resolutionStatus !== "resolved" && value.resolutionStatus !== "partially_resolved") {
    throw new Error("Resolved concept has an invalid resolution status.");
  }

  if (!Array.isArray(value.candidateScenarios) || value.candidateScenarios.length < 1 ||
      value.candidateScenarios.length > 3) {
    throw new Error("Resolved concept must include one to three candidate scenarios.");
  }
  const candidateScenarios = value.candidateScenarios.map((candidate, index) => {
    if (!isRecord(candidate)) throw new Error(`candidateScenarios.${index} must be an object.`);
    const path = `candidateScenarios.${index}`;
    const sourceIds = stringArray(candidate.sourceIds, `${path}.sourceIds`);
    validateSourceIds(sourceIds, allowedSourceIds, `${path}.sourceIds`);
    return {
      id: requiredString(candidate, "id", path),
      name: requiredString(candidate, "name", path),
      description: requiredString(candidate, "description", path),
      targetCustomer: requiredString(candidate, "targetCustomer", path),
      targetGeography: requiredString(candidate, "targetGeography", path),
      businessModel: requiredString(candidate, "businessModel", path),
      revenueModel: requiredString(candidate, "revenueModel", path),
      evidenceStrength: boundedNumber(candidate.evidenceStrength, `${path}.evidenceStrength`),
      sourceIds,
      advantages: stringArray(candidate.advantages, `${path}.advantages`),
      limitations: stringArray(candidate.limitations, `${path}.limitations`),
    };
  });

  if (!isRecord(value.selectedBaselineScenario)) {
    throw new Error("selectedBaselineScenario must be an object.");
  }
  const selected = value.selectedBaselineScenario;
  const selectedSourceIds = stringArray(selected.sourceIds, "selectedBaselineScenario.sourceIds");
  validateSourceIds(selectedSourceIds, allowedSourceIds, "selectedBaselineScenario.sourceIds");
  const selectedBaselineScenario: SelectedBaselineScenario = {
    id: requiredString(selected, "id", "selectedBaselineScenario"),
    name: requiredString(selected, "name", "selectedBaselineScenario"),
    description: requiredString(selected, "description", "selectedBaselineScenario"),
    productCategory: requiredString(selected, "productCategory", "selectedBaselineScenario"),
    customerProblem: requiredString(selected, "customerProblem", "selectedBaselineScenario"),
    targetCustomer: requiredString(selected, "targetCustomer", "selectedBaselineScenario"),
    targetGeography: requiredString(selected, "targetGeography", "selectedBaselineScenario"),
    valueProposition: requiredString(selected, "valueProposition", "selectedBaselineScenario"),
    businessModel: requiredString(selected, "businessModel", "selectedBaselineScenario"),
    revenueModel: requiredString(selected, "revenueModel", "selectedBaselineScenario"),
    pricingApproach: requiredString(selected, "pricingApproach", "selectedBaselineScenario"),
    operatingModel: requiredString(selected, "operatingModel", "selectedBaselineScenario"),
    technologyApproach: requiredString(selected, "technologyApproach", "selectedBaselineScenario"),
    regulatoryScope: requiredString(selected, "regulatoryScope", "selectedBaselineScenario"),
    costProfile: requiredString(selected, "costProfile", "selectedBaselineScenario"),
    commercialUnit: requiredString(selected, "commercialUnit", "selectedBaselineScenario"),
    sourceIds: selectedSourceIds,
  };
  if (!candidateScenarios.some((candidate) => candidate.id === selectedBaselineScenario.id)) {
    throw new Error("Selected baseline scenario must match a candidate scenario.");
  }

  if (!Array.isArray(value.resolvedPublicFacts)) {
    throw new Error("resolvedPublicFacts must be an array.");
  }
  const resolvedPublicFacts = value.resolvedPublicFacts.map((fact, index) => {
    if (!isRecord(fact)) throw new Error(`resolvedPublicFacts.${index} must be an object.`);
    const path = `resolvedPublicFacts.${index}`;
    const sourceIds = stringArray(fact.sourceIds, `${path}.sourceIds`);
    validateSourceIds(sourceIds, allowedSourceIds, `${path}.sourceIds`);
    return {
      field: requiredString(fact, "field", path),
      value: requiredString(fact, "value", path),
      sourceIds,
      confidence: boundedNumber(fact.confidence, `${path}.confidence`),
    };
  });

  if (!Array.isArray(value.explicitAssumptions)) {
    throw new Error("explicitAssumptions must be an array.");
  }
  const explicitAssumptions = value.explicitAssumptions.map((assumption, index) => {
    if (!isRecord(assumption)) throw new Error(`explicitAssumptions.${index} must be an object.`);
    const path = `explicitAssumptions.${index}`;
    if (!impactEnum.includes(assumption.impact as typeof impactEnum[number])) {
      throw new Error(`${path}.impact is invalid.`);
    }
    return {
      field: requiredString(assumption, "field", path),
      value: requiredString(assumption, "value", path),
      reason: requiredString(assumption, "reason", path),
      impact: assumption.impact as "low" | "medium" | "high",
    };
  });

  if (!Array.isArray(value.unresolvedPrivateDecisions)) {
    throw new Error("unresolvedPrivateDecisions must be an array.");
  }
  const unresolvedPrivateDecisions = value.unresolvedPrivateDecisions.map((decision, index) => {
    if (!isRecord(decision)) {
      throw new Error(`unresolvedPrivateDecisions.${index} must be an object.`);
    }
    const path = `unresolvedPrivateDecisions.${index}`;
    if (!impactEnum.includes(decision.decisionImpact as typeof impactEnum[number])) {
      throw new Error(`${path}.decisionImpact is invalid.`);
    }
    return {
      field: requiredString(decision, "field", path),
      reason: requiredString(decision, "reason", path),
      decisionImpact: decision.decisionImpact as "low" | "medium" | "high",
      userAction: requiredString(decision, "userAction", path),
    };
  });

  return {
    version: RESOLVED_CONCEPT_VERSION,
    resolutionStatus: value.resolutionStatus,
    originalBriefSummary: requiredString(value, "originalBriefSummary", "resolvedConcept"),
    candidateScenarios,
    selectedBaselineScenario,
    selectionRationale: requiredString(value, "selectionRationale", "resolvedConcept"),
    resolvedPublicFacts,
    explicitAssumptions,
    unresolvedPrivateDecisions,
    confidence: boundedNumber(value.confidence, "resolvedConcept.confidence"),
  };
}

const COMPLETENESS_FIELDS: Array<keyof SelectedBaselineScenario> = [
  "name", "description", "productCategory", "customerProblem", "targetCustomer",
  "targetGeography", "valueProposition", "businessModel", "revenueModel",
  "pricingApproach", "operatingModel", "technologyApproach", "regulatoryScope",
  "costProfile", "commercialUnit",
];

export function resolvedScenarioCompleteness(
  concept: ResolvedConcept | null | undefined,
): number {
  if (!concept?.selectedBaselineScenario) return 0;
  const complete = COMPLETENESS_FIELDS.filter((field) => {
    const value = concept.selectedBaselineScenario[field];
    return typeof value === "string" && value.trim().length > 0;
  }).length;
  return Math.round((complete / COMPLETENESS_FIELDS.length) * 100);
}

export function claimSourceCoverage(report: {
  claimEvidenceMap?: Array<{ sources?: string[] }>;
}): number {
  const claims = Array.isArray(report?.claimEvidenceMap) ? report.claimEvidenceMap : [];
  if (claims.length === 0) return 0;
  const supported = claims.filter((claim) =>
    Array.isArray(claim.sources) && claim.sources.some((source) => source.trim())
  ).length;
  return Math.round((supported / claims.length) * 100);
}
