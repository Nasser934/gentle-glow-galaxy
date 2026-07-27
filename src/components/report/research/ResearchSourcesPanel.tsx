import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileSearch,
  Loader2,
  Search,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ClaimEvidenceTable } from "@/components/report/evidence/EvidencePanel";
import {
  getReportResearchRun,
  legacyResearchSnapshot,
  listReportResearchSources,
  type ReportResearchRun,
  type ReportResearchSource,
  type ResearchSourceSort,
} from "@/lib/reportResearch";
import type { FeasibilityReport } from "@/types/analysis";

const PAGE_SIZE = 20;
const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};

const displayScore = (value: number | null) => {
  if (value == null || !Number.isFinite(value)) return "—";
  return value <= 1 ? `${Math.round(value * 100)}%` : `${Math.round(value)}`;
};

const elapsed = (start?: string | null, end?: string | null) => {
  if (!start || !end) return "—";
  const seconds = Math.max(
    0,
    Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000),
  );
  if (!Number.isFinite(seconds)) return "—";
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
};

const isStale = (publishedDate: string | null) => {
  if (!publishedDate) return false;
  const year = new Date(publishedDate).getUTCFullYear();
  return Number.isFinite(year) && year < new Date().getUTCFullYear() - 3;
};

const applyLegacyFilters = (
  sources: ReportResearchSource[],
  filters: {
    category: string;
    domain: string;
    authoritativeOnly: boolean;
    extractedOnly: boolean;
    freshness: "all" | "fresh" | "stale";
    sort: ResearchSourceSort;
  },
) => {
  const filtered = sources.filter((source) => {
    if (filters.category && !source.categories.includes(filters.category)) return false;
    if (
      filters.domain &&
      !source.domain.toLowerCase().includes(filters.domain.toLowerCase())
    ) return false;
    if (filters.authoritativeOnly && (source.authority_score ?? 0) < 75) return false;
    if (filters.extractedOnly && !source.extracted) return false;
    if (filters.freshness === "fresh" && (!source.published_date || isStale(source.published_date))) {
      return false;
    }
    if (filters.freshness === "stale" && !isStale(source.published_date)) return false;
    return true;
  });
  return filtered.sort((a, b) => {
    if (filters.sort === "domain") return a.domain.localeCompare(b.domain);
    if (filters.sort === "published") {
      return String(b.published_date ?? "").localeCompare(String(a.published_date ?? ""));
    }
    if (filters.sort === "authority") {
      return (b.authority_score ?? -1) - (a.authority_score ?? -1);
    }
    if (filters.sort === "relevance") {
      return (b.relevance_score ?? -1) - (a.relevance_score ?? -1);
    }
    return (b.source_rank ?? -1) - (a.source_rank ?? -1);
  });
};

export function ResearchSourcesPanel({
  reportId,
  report,
}: {
  reportId?: string;
  report: FeasibilityReport;
}) {
  const legacy = useMemo(() => legacyResearchSnapshot(report), [report]);
  const [mode, setMode] = useState<"loading" | "durable" | "legacy">("loading");
  const [run, setRun] = useState<Partial<ReportResearchRun>>(legacy.run);
  const [sources, setSources] = useState<ReportResearchSource[]>([]);
  const [count, setCount] = useState(0);
  const [loadingSources, setLoadingSources] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [domain, setDomain] = useState("");
  const [authoritativeOnly, setAuthoritativeOnly] = useState(false);
  const [extractedOnly, setExtractedOnly] = useState(false);
  const [freshness, setFreshness] = useState<"all" | "fresh" | "stale">("all");
  const [sort, setSort] = useState<ResearchSourceSort>("strongest");
  const [page, setPage] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    if (!reportId) {
      setRun(legacy.run);
      setMode("legacy");
      return;
    }
    setMode("loading");
    getReportResearchRun(reportId)
      .then((storedRun) => {
        if (cancelled) return;
        if (storedRun) {
          setRun(storedRun);
          setMode("durable");
        } else {
          setRun(legacy.run);
          setMode("legacy");
        }
      })
      .catch(() => {
        if (cancelled) return;
        setRun(legacy.run);
        setMode("legacy");
      });
    return () => { cancelled = true; };
  }, [reportId, legacy]);

  useEffect(() => {
    if (mode === "loading") return;
    let cancelled = false;
    setLoadingSources(true);
    setError(null);
    if (mode === "legacy") {
      const filtered = applyLegacyFilters(legacy.sources, {
        category,
        domain,
        authoritativeOnly,
        extractedOnly,
        freshness,
        sort,
      });
      const from = page * PAGE_SIZE;
      setSources(filtered.slice(from, from + PAGE_SIZE));
      setCount(filtered.length);
      setLoadingSources(false);
      return;
    }
    listReportResearchSources(reportId!, {
      category: category || undefined,
      domain: domain || undefined,
      authoritativeOnly,
      extractedOnly,
      freshness,
      sort,
      page,
      pageSize: PAGE_SIZE,
    })
      .then((result) => {
        if (cancelled) return;
        setSources(result.sources);
        setCount(result.count);
      })
      .catch(() => {
        if (!cancelled) setError("The saved source list could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setLoadingSources(false);
      });
    return () => { cancelled = true; };
  }, [
    mode,
    reportId,
    legacy,
    category,
    domain,
    authoritativeOnly,
    extractedOnly,
    freshness,
    sort,
    page,
  ]);

  const quality = asRecord(run.research_quality);
  const review = asRecord(run.research_review);
  const freshnessData = asRecord(run.freshness);
  const queries = Array.isArray(run.executed_queries)
    ? run.executed_queries.map(asRecord)
    : [];
  const categories = Array.from(new Set([
    ...(Array.isArray(quality.coveredCategories) ? quality.coveredCategories.map(String) : []),
    ...legacy.sources.flatMap((source) => source.categories),
  ])).sort();
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  const resetPage = (update: () => void) => {
    update();
    setPage(0);
  };

  if (mode === "loading") {
    return (
      <div className="flex min-h-48 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {mode === "legacy" && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
          Legacy research snapshot — showing recognized sources saved inside the report.
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSearch className="h-4 w-4 text-primary" />
            Research summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Unique sources", String(run.source_count ?? legacy.sources.length)],
              ["Unique domains", String(run.unique_domain_count ?? 0)],
              ["Authoritative", String(run.authoritative_source_count ?? 0)],
              ["Extracted pages", String(run.extracted_source_count ?? 0)],
              ["Quality score", quality.score != null ? `${quality.score} / 100` : "—"],
              ["Quality level", String(quality.level ?? "Legacy")],
              ["Search queries", String(queries.length)],
              ["Research rounds", String(run.research_round_count ?? "—")],
              ["Completion time", elapsed(run.started_at, run.completed_at)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-border bg-muted/20 p-3">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
                <div className="mt-1 font-display text-lg font-semibold">{value}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Covered categories
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(quality.coveredCategories ?? categories).length > 0
                  ? (quality.coveredCategories ?? categories).map((item: string) => (
                    <Badge key={item} variant="outline">{String(item).replace(/_/g, " ")}</Badge>
                  ))
                  : <span className="text-sm text-muted-foreground">No categories recorded.</span>}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Missing categories
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {Array.isArray(quality.missingCategories) && quality.missingCategories.length > 0
                  ? quality.missingCategories.map((item: string) => (
                    <Badge key={item} variant="outline" className="border-warning/40 text-warning">
                      {String(item).replace(/_/g, " ")}
                    </Badge>
                  ))
                  : <span className="text-sm text-muted-foreground">No recorded coverage gaps.</span>}
              </div>
            </div>
          </div>
          {Array.isArray(freshnessData.warnings) && freshnessData.warnings.length > 0 && (
            <div className="mt-4 rounded-lg border border-warning/40 bg-warning/10 p-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-warning">
                <AlertTriangle className="h-4 w-4" /> Freshness warnings
              </div>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {freshnessData.warnings.map((warning: string) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Executed queries</CardTitle>
        </CardHeader>
        <CardContent>
          {queries.length > 0 ? (
            <details>
              <summary className="cursor-pointer text-sm font-medium text-primary">
                Show {queries.length} search queries
              </summary>
              <div className="mt-3 space-y-2">
                {queries.map((query, index) => (
                  <div key={String(query.id ?? index)} className="rounded-lg border border-border p-3 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <span className="break-words font-medium">{String(query.query ?? "")}</span>
                      <Badge variant="outline">{String(query.status ?? "recorded")}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {String(query.category ?? "uncategorized")} · priority {String(query.priority ?? "—")}
                    </div>
                    {query.reason && <p className="mt-1 text-xs text-muted-foreground">{String(query.reason)}</p>}
                  </div>
                ))}
              </div>
            </details>
          ) : (
            <p className="text-sm text-muted-foreground">No executed-query detail was saved.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Research review</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            {review.enough
              ? <CheckCircle2 className="h-4 w-4 text-success" />
              : <AlertTriangle className="h-4 w-4 text-warning" />}
            <span className="font-medium">
              {review.enough ? "Evidence considered sufficient for this analysis" : "Additional validation is recommended"}
            </span>
          </div>
          {review.rationale && <p className="text-muted-foreground">{String(review.rationale)}</p>}
          {[
            ["Missing areas", review.missingAreas],
            ["Unsupported claims", review.unsupportedClaims],
            ["Freshness warnings", freshnessData.warnings],
          ].map(([label, items]) => (
            Array.isArray(items) && items.length > 0 ? (
              <div key={String(label)}>
                <div className="font-medium">{String(label)}</div>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                  {items.map((item: unknown) => <li key={String(item)}>{String(item)}</li>)}
                </ul>
              </div>
            ) : null
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
            <span>Sources</span>
            <Badge variant="outline">{count} matching · {run.source_count ?? count} total</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="text-xs text-muted-foreground">
              Category
              <select
                aria-label="Category"
                value={category}
                onChange={(event) => resetPage(() => setCategory(event.target.value))}
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
              >
                <option value="">All categories</option>
                {categories.map((item) => (
                  <option key={item} value={item}>{item.replace(/_/g, " ")}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              Domain
              <div className="relative mt-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  aria-label="Domain"
                  value={domain}
                  onChange={(event) => resetPage(() => setDomain(event.target.value))}
                  placeholder="example.gov"
                  className="pl-9"
                />
              </div>
            </label>
            <label className="text-xs text-muted-foreground">
              Freshness
              <select
                aria-label="Freshness"
                value={freshness}
                onChange={(event) => resetPage(
                  () => setFreshness(event.target.value as typeof freshness),
                )}
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
              >
                <option value="all">All dates</option>
                <option value="fresh">Fresh</option>
                <option value="stale">Stale</option>
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              Sort
              <select
                aria-label="Sort"
                value={sort}
                onChange={(event) => resetPage(
                  () => setSort(event.target.value as ResearchSourceSort),
                )}
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
              >
                <option value="strongest">Strongest first</option>
                <option value="relevance">Relevance</option>
                <option value="authority">Authority</option>
                <option value="published">Publication date</option>
                <option value="domain">Domain</option>
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={authoritativeOnly}
                onChange={(event) => resetPage(() => setAuthoritativeOnly(event.target.checked))}
              />
              Authoritative only
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={extractedOnly}
                onChange={(event) => resetPage(() => setExtractedOnly(event.target.checked))}
              />
              Extracted only
            </label>
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          {loadingSources ? (
            <div className="flex min-h-36 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : sources.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              <FileSearch className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium">No saved sources match this view.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Legacy and external-agent reports may not include a research snapshot.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {sources.map((source) => (
                <article
                  key={source.id}
                  data-testid="research-source"
                  className="min-w-0 rounded-lg border border-border p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h3 className="break-words text-sm font-semibold text-foreground">
                        {source.title}
                      </h3>
                      <div className="mt-1 text-xs text-muted-foreground">{source.domain}</div>
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 block break-all text-xs text-primary hover:underline"
                      >
                        {source.url}
                      </a>
                    </div>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open ${source.title}`}
                      className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary"
                    >
                      Open <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {source.categories.map((item) => (
                      <Badge key={item} variant="outline">{item.replace(/_/g, " ")}</Badge>
                    ))}
                    <Badge variant="outline">Authority {displayScore(source.authority_score)}</Badge>
                    <Badge variant="outline">Relevance {displayScore(source.relevance_score)}</Badge>
                    <Badge variant="outline">{source.extracted ? "Extracted" : "Snippet only"}</Badge>
                    {source.published_date && (
                      <Badge
                        variant="outline"
                        className={isStale(source.published_date) ? "border-warning/40 text-warning" : ""}
                      >
                        {source.published_date}
                      </Badge>
                    )}
                  </div>
                  {(source.content_excerpt || source.snippet) && (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs font-medium text-primary">
                        View excerpt
                      </summary>
                      <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground">
                        {source.content_excerpt || source.snippet}
                      </p>
                    </details>
                  )}
                </article>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <span className="text-xs text-muted-foreground">
              Page {Math.min(page + 1, totalPages)} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((value) => Math.max(0, value - 1))}
                disabled={page === 0}
              >
                <ChevronLeft className="mr-1 h-4 w-4" /> Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((value) => value + 1)}
                disabled={page + 1 >= totalPages}
              >
                Next <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <ClaimEvidenceTable report={report} />
    </div>
  );
}
