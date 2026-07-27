import type {
  ResearchQuality,
  ResearchSource,
  ResearchState,
} from "./researchAgent.ts";

export interface ResearchPersistenceStore {
  upsertRun(row: Record<string, unknown>): Promise<string>;
  upsertSources(rows: Record<string, unknown>[]): Promise<void>;
  updateReportMetadata(
    reportId: string,
    metadata: Record<string, unknown>,
  ): Promise<void>;
}

export interface ResearchPersistencePayload {
  reportId: string;
  analysisJobId?: string | null;
  state: ResearchState;
  quality: ResearchQuality;
  policyVersion?: string | null;
  promptVersion?: string | null;
  promptHash?: string | null;
  modelId?: string | null;
  freshness?: Record<string, unknown>;
  sourceSnapshotMetadata: Record<string, unknown>;
  completedAt?: string | null;
}

const sourceRank = (source: ResearchSource) =>
  Math.round(
    (source.authorityScore * 0.45 + source.relevanceScore * 100 * 0.55) * 100,
  ) / 100;

export function researchSourceRow(
  source: ResearchSource,
  reportId: string,
  runId: string,
): Record<string, unknown> {
  return {
    research_run_id: runId,
    report_id: reportId,
    normalized_url: source.normalizedUrl,
    url: source.url,
    domain: source.domain,
    title: source.title,
    snippet: source.snippet ? source.snippet.slice(0, 2_500) : null,
    content_excerpt: source.extractedContent
      ? source.extractedContent.slice(0, 6_000)
      : null,
    relevance_score: source.relevanceScore,
    authority_score: source.authorityScore,
    categories: source.categories,
    query_ids: source.queryIds,
    published_date: source.publishedDate,
    extracted: source.extracted,
    extraction_attempted: Boolean(source.extractionAttempted),
    source_rank: sourceRank(source),
  };
}

const chunks = <T>(values: T[], size: number): T[][] => {
  const output: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    output.push(values.slice(index, index + size));
  }
  return output;
};

export async function persistReportResearchSnapshot(
  store: ResearchPersistenceStore,
  payload: ResearchPersistencePayload,
): Promise<{ researchRunId: string; persistedSourceCount: number }> {
  const executedQueries = payload.state.queries.map((query) => ({
    ...query,
    status: payload.state.completedQueryIds.includes(query.id)
      ? "completed"
      : payload.state.failedQueryIds.includes(query.id)
        ? "failed"
        : "not_run",
  }));
  const runId = await store.upsertRun({
    report_id: payload.reportId,
    analysis_job_id: payload.analysisJobId ?? null,
    policy_version: payload.policyVersion ?? null,
    prompt_version: payload.promptVersion ?? null,
    prompt_hash: payload.promptHash ?? null,
    model_id: payload.modelId ?? null,
    research_quality: payload.quality,
    research_review: payload.state.review ?? {},
    freshness: payload.freshness ?? {},
    executed_queries: executedQueries,
    source_count: payload.state.sources.length,
    unique_domain_count: payload.quality.uniqueDomains,
    authoritative_source_count: payload.quality.authoritativeSources,
    extracted_source_count: payload.quality.extractedSources,
    research_round_count: payload.state.round,
    started_at: payload.state.startedAt || null,
    completed_at: payload.completedAt ?? null,
  });

  const rows = payload.state.sources.map((source) =>
    researchSourceRow(source, payload.reportId, runId)
  );
  for (const batch of chunks(rows, 50)) {
    await store.upsertSources(batch);
  }

  await store.updateReportMetadata(payload.reportId, {
    ...payload.sourceSnapshotMetadata,
    researchPersistenceStatus: "completed",
    researchRunId: runId,
    persistedSourceCount: rows.length,
  });
  return { researchRunId: runId, persistedSourceCount: rows.length };
}

export function supabaseResearchPersistenceStore(
  db: any,
): ResearchPersistenceStore {
  return {
    async upsertRun(row) {
      const { data, error } = await db
        .from("report_research_runs")
        .upsert(row, { onConflict: "report_id" })
        .select("id")
        .single();
      if (error) throw error;
      if (!data?.id) throw new Error("Research run upsert did not return an id.");
      return String(data.id);
    },
    async upsertSources(rows) {
      if (rows.length === 0) return;
      const { error } = await db
        .from("report_research_sources")
        .upsert(rows, { onConflict: "report_id,normalized_url" });
      if (error) throw error;
    },
    async updateReportMetadata(reportId, metadata) {
      const { error } = await db
        .from("reports")
        .update({ source_snapshot_metadata: metadata })
        .eq("id", reportId);
      if (error) throw error;
    },
  };
}
