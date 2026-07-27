import {
  kimiStructured,
  type KimiMessage,
} from "./kimi.ts";
import {
  governedStageInstruction,
} from "./ai/promptManifest.ts";
import {
  resolvedConceptSchema,
  validateResolvedConcept,
  type ResolvedConcept,
} from "./ai/schemas/resolved-concept.schema.ts";
import {
  ensureResearchSourceIds,
  type ResearchQuality,
  type ResearchState,
} from "./researchAgent.ts";

type StructuredCall = (
  messages: KimiMessage[],
  toolName: string,
  toolDescription: string,
  parameters: Record<string, unknown>,
  options?: { reasoningEffort?: "low" | "high" | "max"; timeoutMs?: number },
) => Promise<unknown>;

const wordCount = (value: unknown) =>
  String(value ?? "").trim().split(/\s+/).filter(Boolean).length;

/**
 * Allows a resolver failure fallback only when the original brief already
 * identifies a concrete solution plus enough private operating constraints.
 */
export function conceptIsSpecificEnough(
  inputs: Record<string, string>,
): boolean {
  const descriptionIsConcrete = wordCount(inputs.description) >= 12;
  const namedIndustry = wordCount(inputs.industry) >= 1;
  const privateSignals = [
    inputs.location,
    inputs.businessModel,
    inputs.revenueModel,
    inputs.budgetRange,
    inputs.timeline,
    inputs.strategicObjectives,
    inputs.founderExperience,
  ].filter((value) => wordCount(value) > 0).length;
  return descriptionIsConcrete && namedIndustry && privateSignals >= 3;
}

function resolverSources(state: ResearchState) {
  return ensureResearchSourceIds(state.sources ?? []).map((source) => ({
    id: source.id,
    title: source.title,
    url: source.url,
    domain: source.domain,
    categories: source.categories,
    authorityScore: source.authorityScore,
    relevanceScore: source.relevanceScore,
    publishedDate: source.publishedDate,
    extracted: source.extracted,
    content: (source.extractedContent || source.snippet).slice(0, 2_000),
  }));
}

export async function resolveConcept(
  originalInputs: Record<string, string>,
  state: ResearchState,
  quality: ResearchQuality,
  structuredCall: StructuredCall = kimiStructured,
): Promise<ResolvedConcept> {
  const sources = resolverSources(state);
  const allowedSourceIds = new Set(sources.map((source) => source.id));
  const result = await structuredCall(
    [
      {
        role: "system",
        content: governedStageInstruction("concept-resolver"),
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            originalInputs,
            researchQuality: quality,
            researchReview: state.review,
            executedQueries: state.queries,
            sources,
          },
          null,
          2,
        ),
      },
    ],
    "resolve_concept",
    "Select a research-supported baseline scenario without scoring FMART-O.",
    resolvedConceptSchema as unknown as Record<string, unknown>,
    { reasoningEffort: "low", timeoutMs: 110_000 },
  );
  return validateResolvedConcept(result, allowedSourceIds);
}
