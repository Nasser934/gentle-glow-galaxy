import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import type { FeasibilityReport } from "@/types/analysis";

export type ReportResearchRun =
  Database["public"]["Tables"]["report_research_runs"]["Row"];
export type ReportResearchSource =
  Database["public"]["Tables"]["report_research_sources"]["Row"];

export type ResearchSourceSort =
  | "strongest"
  | "relevance"
  | "authority"
  | "published"
  | "domain";

export interface ResearchSourceFilters {
  category?: string;
  domain?: string;
  authoritativeOnly?: boolean;
  extractedOnly?: boolean;
  freshness?: "all" | "fresh" | "stale";
  sort?: ResearchSourceSort;
  page?: number;
  pageSize?: number;
}

export async function getReportResearchRun(
  reportId: string,
): Promise<ReportResearchRun | null> {
  const { data, error } = await supabase
    .from("report_research_runs")
    .select("*")
    .eq("report_id", reportId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

const SOURCE_COLUMNS = [
  "id",
  "research_run_id",
  "report_id",
  "normalized_url",
  "url",
  "domain",
  "title",
  "snippet",
  "content_excerpt",
  "relevance_score",
  "authority_score",
  "categories",
  "query_ids",
  "published_date",
  "extracted",
  "extraction_attempted",
  "source_rank",
  "created_at",
].join(", ");

export async function listReportResearchSources(
  reportId: string,
  filters: ResearchSourceFilters = {},
): Promise<{ sources: ReportResearchSource[]; count: number }> {
  const pageSize = Math.min(50, Math.max(1, filters.pageSize ?? 20));
  const page = Math.max(0, filters.page ?? 0);
  let query = supabase
    .from("report_research_sources")
    .select(SOURCE_COLUMNS, { count: "exact" })
    .eq("report_id", reportId);

  if (filters.category) query = query.contains("categories", [filters.category]);
  if (filters.domain?.trim()) {
    query = query.ilike("domain", `%${filters.domain.trim()}%`);
  }
  if (filters.authoritativeOnly) query = query.gte("authority_score", 75);
  if (filters.extractedOnly) query = query.eq("extracted", true);
  if (filters.freshness && filters.freshness !== "all") {
    const cutoff = `${new Date().getUTCFullYear() - 3}-01-01`;
    query = filters.freshness === "fresh"
      ? query.gte("published_date", cutoff)
      : query.lt("published_date", cutoff);
  }

  const sort = filters.sort ?? "strongest";
  const sortField: Record<ResearchSourceSort, keyof ReportResearchSource> = {
    strongest: "source_rank",
    relevance: "relevance_score",
    authority: "authority_score",
    published: "published_date",
    domain: "domain",
  };
  query = query.order(sortField[sort], {
    ascending: sort === "domain",
    nullsFirst: false,
  });
  const from = page * pageSize;
  const { data, error, count } = await query.range(from, from + pageSize - 1);
  if (error) throw error;
  return {
    sources: (data ?? []) as unknown as ReportResearchSource[],
    count: count ?? 0,
  };
}

export interface LegacyResearchSnapshot {
  legacy: true;
  run: Partial<ReportResearchRun>;
  sources: ReportResearchSource[];
}

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};

const domainFrom = (url: string, fallback = "Unknown source") => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return fallback;
  }
};

/** Recognized fallback locations for reports created before durable snapshots. */
export function legacyResearchSnapshot(
  report: FeasibilityReport,
): LegacyResearchSnapshot {
  const research = asRecord(report.research);
  const rawSources = [
    ...(Array.isArray(research.sources) ? research.sources : []),
    ...(Array.isArray(research.citations) ? research.citations : []),
  ];
  const byUrl = new Map<string, ReportResearchSource>();
  rawSources.forEach((raw, index) => {
    const source = asRecord(raw);
    const url = String(source.url ?? "").trim();
    if (!url || byUrl.has(url)) return;
    const domain = String(source.domain ?? source.source ?? domainFrom(url));
    byUrl.set(url, {
      id: String(source.id ?? `legacy-source-${index}`),
      research_run_id: "legacy",
      report_id: "legacy",
      normalized_url: String(source.normalizedUrl ?? url),
      url,
      domain,
      title: String(source.title ?? domain),
      snippet: source.snippet ? String(source.snippet) : null,
      content_excerpt: source.content_excerpt || source.content || source.takeaway
        ? String(source.content_excerpt ?? source.content ?? source.takeaway).slice(0, 6_000)
        : null,
      relevance_score: Number.isFinite(Number(source.relevanceScore))
        ? Number(source.relevanceScore)
        : null,
      authority_score: Number.isFinite(Number(source.authorityScore))
        ? Number(source.authorityScore)
        : null,
      categories: Array.isArray(source.categories)
        ? source.categories.map(String)
        : [],
      query_ids: Array.isArray(source.queryIds)
        ? source.queryIds.map(String)
        : [],
      published_date: source.publishedDate ? String(source.publishedDate) : null,
      extracted: Boolean(source.extracted),
      extraction_attempted: Boolean(source.extractionAttempted),
      source_rank: Number.isFinite(Number(source.sourceRank))
        ? Number(source.sourceRank)
        : null,
      created_at: "",
    });
  });
  const sources = Array.from(byUrl.values());
  const quality = asRecord(research.quality);
  return {
    legacy: true,
    run: {
      id: "legacy",
      report_id: "legacy",
      research_quality: quality as Json,
      research_review: asRecord(research.review) as Json,
      freshness: asRecord(research.freshness) as Json,
      executed_queries: (Array.isArray(research.executedQueries)
        ? research.executedQueries
        : []) as Json,
      source_count: sources.length,
      unique_domain_count: new Set(sources.map((source) => source.domain)).size,
      authoritative_source_count: sources.filter(
        (source) => (source.authority_score ?? 0) >= 75,
      ).length,
      extracted_source_count: sources.filter((source) => source.extracted).length,
      research_round_count: Number(research.round ?? 0),
      started_at: null,
      completed_at: research.generatedAt ? String(research.generatedAt) : null,
    },
    sources,
  };
}
