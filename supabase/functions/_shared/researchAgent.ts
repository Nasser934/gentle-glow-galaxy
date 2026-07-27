// Deep research agent: Kimi planning → parallel Tavily search → extract → review.
import {
  kimiStructured,
  KimiError,
} from "./kimi.ts";
export const MIN_UNIQUE_SOURCES = 20;
export const MAX_RESEARCH_ROUNDS = 6;
export const MAX_TOTAL_QUERIES = 60;
export const MAX_STORED_SOURCES = 120;
export const MAX_RESEARCH_DURATION_MS = 15 * 60_000;
export const SEARCH_BATCH_SIZE = 6;
export const SEARCH_CONCURRENCY = 4;
export const EXTRACT_BATCH_SIZE = 20;
export type ResearchCategory =
  | "market_size"
  | "market_growth"
  | "customer_demand"
  | "pricing"
  | "competitors"
  | "costs"
  | "regulation"
  | "technology"
  | "risks"
  | "local_context";
export interface PlannedQuery {
  id: string;
  query: string;
  category: ResearchCategory;
  priority: number;
  reason: string;
}
export interface ResearchSource {
  url: string;
  normalizedUrl: string;
  domain: string;
  title: string;
  snippet: string;
  extractedContent: string | null;
  relevanceScore: number;
  authorityScore: number;
  categories: ResearchCategory[];
  queryIds: string[];
  publishedDate: string | null;
  extracted: boolean;
  /** True once an extraction attempt was made (successful or not). */
  extractionAttempted?: boolean;
}
export interface ResearchReview {
  enough: boolean;
  rationale: string;
  missingAreas: string[];
  unsupportedClaims: string[];
  additionalQueries: PlannedQuery[];
}
export interface ResearchQuality {
  score: number;
  level: "High" | "Medium" | "Low" | "Limited";
  uniqueSources: number;
  uniqueDomains: number;
  authoritativeSources: number;
  extractedSources: number;
  coveredCategories: ResearchCategory[];
  missingCategories: ResearchCategory[];
  averageRelevance: number;
  minimumSourceTargetMet: boolean;
}
export interface ResearchState {
  phase:
    | "planning"
    | "searching"
    | "extracting"
    | "reviewing"
    | "completed";
  round: number;
  queries: PlannedQuery[];
  completedQueryIds: string[];
  failedQueryIds: string[];
  sources: ResearchSource[];
  review: ResearchReview | null;
  startedAt: string;
  updatedAt: string;
}
const REQUIRED_CATEGORIES: ResearchCategory[] = [
  "market_size",
  "market_growth",
  "customer_demand",
  "pricing",
  "competitors",
  "costs",
  "regulation",
  "technology",
  "risks",
  "local_context",
];
const queryPlanSchema = {
  type: "object",
  properties: {
    queries: {
      type: "array",
      minItems: 8,
      maxItems: 12,
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          query: { type: "string" },
          category: {
            type: "string",
            enum: REQUIRED_CATEGORIES,
          },
          priority: {
            type: "number",
            minimum: 1,
            maximum: 10,
          },
          reason: { type: "string" },
        },
        required: [
          "id",
          "query",
          "category",
          "priority",
          "reason",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["queries"],
  additionalProperties: false,
};
const reviewSchema = {
  type: "object",
  properties: {
    enough: { type: "boolean" },
    rationale: { type: "string" },
    missingAreas: {
      type: "array",
      items: { type: "string" },
    },
    unsupportedClaims: {
      type: "array",
      items: { type: "string" },
    },
    additionalQueries: {
      type: "array",
      maxItems: 10,
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          query: { type: "string" },
          category: {
            type: "string",
            enum: REQUIRED_CATEGORIES,
          },
          priority: {
            type: "number",
            minimum: 1,
            maximum: 10,
          },
          reason: { type: "string" },
        },
        required: [
          "id",
          "query",
          "category",
          "priority",
          "reason",
        ],
        additionalProperties: false,
      },
    },
  },
  required: [
    "enough",
    "rationale",
    "missingAreas",
    "unsupportedClaims",
    "additionalQueries",
  ],
  additionalProperties: false,
};
function tavilyKey(): string {
  const key = Deno.env.get("TAVILY_API_KEY");
  if (!key) {
    throw new Error("TAVILY_API_KEY is not configured.");
  }
  return key;
}
export class TavilyError extends Error {
  status: number;
  retryAfterSeconds: number | null;
  constructor(status: number, message: string, retryAfterSeconds: number | null = null) {
    super(message);
    this.name = "TavilyError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export const TAVILY_MAX_ATTEMPTS = 3;
export const TAVILY_RETRY_STATUSES = [429, 500, 502, 503, 504];
const TAVILY_BACKOFF_MS = [2_000, 5_000];

export type SleepFn = (ms: number) => Promise<void>;
const defaultSleep: SleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function isRetryableTavilyError(error: unknown): boolean {
  if (error instanceof TavilyError) {
    return TAVILY_RETRY_STATUSES.includes(error.status);
  }
  // Network/timeout failures are transient.
  return true;
}

/** Delay before the next attempt (attempt is 1-based and already failed). */
export function tavilyRetryDelayMs(attempt: number, error: unknown): number {
  if (
    error instanceof TavilyError &&
    typeof error.retryAfterSeconds === "number" &&
    Number.isFinite(error.retryAfterSeconds) &&
    error.retryAfterSeconds > 0
  ) {
    return Math.min(error.retryAfterSeconds, 30) * 1_000;
  }
  return TAVILY_BACKOFF_MS[attempt - 1] ?? TAVILY_BACKOFF_MS[TAVILY_BACKOFF_MS.length - 1];
}

export async function withTavilyRetry<T>(
  run: () => Promise<T>,
  sleep: SleepFn = defaultSleep,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= TAVILY_MAX_ATTEMPTS; attempt++) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      if (!isRetryableTavilyError(error) || attempt === TAVILY_MAX_ATTEMPTS) throw error;
      await sleep(tavilyRetryDelayMs(attempt, error));
    }
  }
  throw lastError;
}

async function tavilyPost(
  path: string,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<any> {
  const response = await fetch(
    `https://api.tavily.com${path}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tavilyKey()}`,
        "Content-Type": "application/json",
        "X-Project-ID": "concept-ai",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    },
  );
  if (!response.ok) {
    const safeText = (await response.text()).slice(0, 300);
    const retryAfterRaw = response.headers?.get?.("retry-after");
    const retryAfter = retryAfterRaw && /^\d+$/.test(retryAfterRaw.trim())
      ? Number(retryAfterRaw.trim())
      : null;
    throw new TavilyError(
      response.status,
      `Tavily ${path} failed with status ${response.status}: ${safeText}`,
      retryAfter,
    );
  }
  return await response.json();
}

function normalizeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.hash = "";
    const removable = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "gclid",
      "fbclid",
    ];
    for (const key of removable) {
      url.searchParams.delete(key);
    }
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  } catch {
    return raw.trim();
  }
}
function domainFromUrl(raw: string): string {
  try {
    return new URL(raw).hostname
      .toLowerCase()
      .replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}
/** Exact-domain or true-subdomain match. `fakeun.org` never matches `un.org`. */
export function isDomainOrSubdomain(domain: string, root: string): boolean {
  const d = String(domain ?? "").toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  const r = String(root ?? "").toLowerCase();
  return d === r || d.endsWith(`.${r}`);
}

const AUTHORITY_SUFFIXES: string[] = ["gov", "edu", "gov.sa", "gov.ae", "ac.uk", "int"];
const TIER_ONE_DOMAINS = [
  "worldbank.org", "imf.org", "oecd.org", "un.org", "who.int", "itu.int",
  "statista.com", "gartner.com", "mckinsey.com", "deloitte.com",
  "pwc.com", "ey.com", "kpmg.com",
];
const TIER_TWO_DOMAINS = [
  "reuters.com", "bloomberg.com", "ft.com", "economist.com", "forbes.com",
];
const LOW_TRUST_DOMAINS = [
  "reddit.com", "news.ycombinator.com", "wikipedia.org", "quora.com", "medium.com",
];

export function authorityScore(domain: string): number {
  const d = String(domain ?? "").toLowerCase().replace(/^www\./, "");
  // Public-sector / academic TLD suffixes must be real label boundaries.
  if (AUTHORITY_SUFFIXES.some((suffix) => d === suffix || d.endsWith(`.${suffix}`))) {
    return 100;
  }
  if (TIER_ONE_DOMAINS.some((root) => isDomainOrSubdomain(d, root))) return 90;
  if (TIER_TWO_DOMAINS.some((root) => isDomainOrSubdomain(d, root))) return 75;
  if (LOW_TRUST_DOMAINS.some((root) => isDomainOrSubdomain(d, root))) return 35;
  return 55;
}

/** Categories where only reasonably recent evidence is acceptable. */
export const FRESHNESS_SENSITIVE_CATEGORIES: ResearchCategory[] = [
  "market_size",
  "market_growth",
  "competitors",
  "pricing",
  "regulation",
  "technology",
];
export const FRESHNESS_WINDOW_YEARS = 3;

export function freshnessStartDate(
  category: ResearchCategory,
  now: Date = new Date(),
): string | null {
  if (!FRESHNESS_SENSITIVE_CATEGORIES.includes(category)) return null;
  return `${now.getUTCFullYear() - FRESHNESS_WINDOW_YEARS}-01-01`;
}

/** True when the source is older than the freshness window (unknown dates are not stale). */
export function isStaleSource(
  source: { publishedDate: string | null },
  now: Date = new Date(),
): boolean {
  if (!source.publishedDate) return false;
  const parsed = new Date(source.publishedDate);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getUTCFullYear() < now.getUTCFullYear() - FRESHNESS_WINDOW_YEARS;
}

/** A source only counts as extracted with real extracted page content. */
export function isExtractedSource(source: ResearchSource): boolean {
  return (
    source.extracted === true &&
    typeof source.extractedContent === "string" &&
    source.extractedContent.trim().length > 100
  );
}

export function countExtractedSources(sources: ResearchSource[]): number {
  return (sources ?? []).filter(isExtractedSource).length;
}

function clamp(
  value: number,
  min: number,
  max: number,
): number {
  return Math.min(max, Math.max(min, value));
}
async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const output: R[] = new Array(items.length);
  let nextIndex = 0;
  const runners = Array.from(
    {
      length: Math.min(
        concurrency,
        Math.max(1, items.length),
      ),
    },
    async () => {
      while (true) {
        const index = nextIndex++;
        if (index >= items.length) return;
        output[index] = await worker(items[index]);
      }
    },
  );
  await Promise.all(runners);
  return output;
}
function conceptContext(
  inputs: Record<string, string>,
): string {
  return [
    `Project: ${inputs.projectName || "Unknown"}`,
    `Industry: ${inputs.industry || "Unknown"}`,
    `Location: ${inputs.location || "Not specified"}`,
    `Description: ${inputs.description || ""}`,
    `Business model: ${inputs.businessModel || "Not specified"}`,
    `Revenue model: ${inputs.revenueModel || "Not specified"}`,
    `Budget: ${inputs.budgetRange || "Not specified"}`,
    `Timeline: ${inputs.timeline || "Not specified"}`,
    `Regulation: ${
      inputs.regulatoryConsiderations || "Not specified"
    }`,
    `Competitor URLs: ${
      inputs.competitorUrls || "None supplied"
    }`,
  ].join("\n");
}
function cleanPlannedQueries(
  queries: PlannedQuery[],
  existing: PlannedQuery[] = [],
): PlannedQuery[] {
  const existingText = new Set(
    existing.map((query) =>
      query.query.trim().toLowerCase()
    ),
  );
  const seenIds = new Set(
    existing.map((query) => query.id),
  );
  const result: PlannedQuery[] = [];
  for (const raw of queries ?? []) {
    const query = String(raw?.query ?? "").trim();
    const category = raw?.category as ResearchCategory;
    if (
      query.length < 8 ||
      !REQUIRED_CATEGORIES.includes(category)
    ) {
      continue;
    }
    const normalized = query.toLowerCase();
    if (
      existingText.has(normalized) ||
      result.some(
        (item) =>
          item.query.toLowerCase() === normalized,
      )
    ) {
      continue;
    }
    let id = String(raw.id || crypto.randomUUID());
    while (seenIds.has(id)) {
      id = crypto.randomUUID();
    }
    seenIds.add(id);
    result.push({
      id,
      query,
      category,
      priority: clamp(
        Number(raw.priority ?? 5),
        1,
        10,
      ),
      reason: String(raw.reason ?? ""),
    });
  }
  return result;
}
export function createInitialResearchState():
  ResearchState {
  const now = new Date().toISOString();
  return {
    phase: "planning",
    // The initial search is round 1; expansions go up to MAX_RESEARCH_ROUNDS.
    round: 1,
    queries: [],
    completedQueryIds: [],
    failedQueryIds: [],
    sources: [],
    review: null,
    startedAt: now,
    updatedAt: now,
  };
}

export const MIN_INITIAL_QUERIES = 8;
export const MAX_INITIAL_QUERIES = 12;

const FALLBACK_QUERY_TEMPLATES: Record<ResearchCategory, string> = {
  market_size: "{industry} market size {location} report",
  market_growth: "{industry} market growth forecast {location}",
  customer_demand: "{industry} customer demand and adoption {location} survey",
  pricing: "{industry} pricing benchmarks {location}",
  competitors: "leading {industry} companies competing in {location}",
  costs: "{industry} startup and operating costs {location}",
  regulation: "{industry} regulation licensing requirements {location}",
  technology: "{industry} technology platforms and readiness {project}",
  risks: "{industry} business failure risks and challenges {location}",
  local_context: "{location} {industry} market conditions and local context",
};

/**
 * Deterministic, context-specific fallback queries for research categories the
 * planner failed to cover. Never emits a bare project-name query.
 */
export function buildFallbackQueries(
  inputs: Record<string, string>,
  existing: PlannedQuery[],
  limit = MAX_INITIAL_QUERIES,
): PlannedQuery[] {
  const industry = (inputs.industry || inputs.businessModel || "business").trim();
  const location = (inputs.location || "global market").trim();
  const project = (inputs.projectName || industry).trim();
  const covered = new Set(existing.map((query) => query.category));
  const existingText = new Set(existing.map((query) => query.query.trim().toLowerCase()));
  const missing = REQUIRED_CATEGORIES.filter((category) => !covered.has(category));
  const ordered = [...missing, ...REQUIRED_CATEGORIES.filter((c) => covered.has(c))];

  const candidates: PlannedQuery[] = [];
  for (const category of ordered) {
    if (existing.length + candidates.length >= limit) break;
    const query = FALLBACK_QUERY_TEMPLATES[category]
      .replaceAll("{industry}", industry)
      .replaceAll("{location}", location)
      .replaceAll("{project}", project)
      .replace(/\s+/g, " ")
      .trim();
    if (query.length < 8 || existingText.has(query.toLowerCase())) continue;
    existingText.add(query.toLowerCase());
    candidates.push({
      id: crypto.randomUUID(),
      query,
      category,
      priority: missing.includes(category) ? 8 : 4,
      reason: `Deterministic fallback query ensuring ${category} coverage.`,
    });
  }
  return candidates;
}

/** Guarantees 8–12 distinct initial queries covering the required categories. */
export function ensureMinimumQueryPlan(
  planned: PlannedQuery[],
  inputs: Record<string, string>,
): PlannedQuery[] {
  const base = planned.slice(0, MAX_INITIAL_QUERIES);
  if (base.length >= MIN_INITIAL_QUERIES) return base;
  const fallbacks = buildFallbackQueries(inputs, base, MAX_INITIAL_QUERIES);
  const combined = [...base, ...fallbacks].slice(0, MAX_INITIAL_QUERIES);
  return combined;
}

export async function planResearchQueries(
  inputs: Record<string, string>,
): Promise<PlannedQuery[]> {
  const context = conceptContext(inputs);
  const result = await kimiStructured(
    [
      {
        role: "system",
        content: `You are the research planner for a feasibility-analysis system.
Plan targeted internet searches before any business score is created.
Cover market size, growth, actual customer demand, willingness to pay,
competitors, pricing, startup costs, operating costs, regulation,
technology readiness, failure risks and local market context.
Use geography-specific searches.
Use English and the local language when useful.
Prefer searches likely to return government, regulator, official statistics,
academic, company filings and established industry-research sources.
Do not produce conclusions yet.`,
      },
      {
        role: "user",
        content: context,
      },
    ],
    "provide_research_plan",
    "Provide targeted internet-search queries.",
    queryPlanSchema,
    {
      reasoningEffort: "low",
      timeoutMs: 100_000,
    },
  );
  const cleaned = cleanPlannedQueries(result?.queries ?? []);
  return ensureMinimumQueryPlan(cleaned, inputs);
}

export async function searchOneQuery(
  planned: PlannedQuery,
  sleep?: SleepFn,
  now: Date = new Date(),
): Promise<{
  queryId: string;
  sources: ResearchSource[];
  failed: boolean;
}> {
  const startDate = freshnessStartDate(planned.category, now);
  try {
    const data = await withTavilyRetry(
      () =>
        tavilyPost(
          "/search",
          {
            query: planned.query,
            search_depth: "advanced",
            max_results: 20,
            chunks_per_source: 3,
            include_answer: false,
            include_raw_content: false,
            include_images: false,
            topic: "general",
            ...(startDate ? { start_date: startDate } : {}),
          },
          35_000,
        ),
      sleep,
    );
    const sources: ResearchSource[] = [];
    for (const result of data?.results ?? []) {
      const url = String(result?.url ?? "").trim();
      const title = String(result?.title ?? "").trim();
      if (!url || !title) continue;
      const normalizedUrl = normalizeUrl(url);
      const domain = domainFromUrl(url);
      const relevance = clamp(
        Number(result?.score ?? 0),
        0,
        1,
      );
      if (relevance < 0.25) continue;
      sources.push({
        url,
        normalizedUrl,
        domain,
        title,
        snippet: String(result?.content ?? "")
          .trim()
          .slice(0, 2_500),
        extractedContent: null,
        relevanceScore: relevance,
        authorityScore: authorityScore(domain),
        categories: [planned.category],
        queryIds: [planned.id],
        publishedDate:
          typeof result?.published_date === "string"
            ? result.published_date
            : null,
        extracted: false,
        extractionAttempted: false,
      });
    }
    return {
      queryId: planned.id,
      sources,
      failed: false,
    };
  } catch (error) {
    console.warn(
      "Tavily query failed after retries",
      planned.id,
      error instanceof Error
        ? error.message
        : String(error),
    );
    return {
      queryId: planned.id,
      sources: [],
      failed: true,
    };
  }
}

export function mergeResearchSources(
  existing: ResearchSource[],
  incoming: ResearchSource[],
): ResearchSource[] {
  const byUrl = new Map<string, ResearchSource>();
  for (const source of [
    ...(existing ?? []),
    ...(incoming ?? []),
  ]) {
    const current = byUrl.get(source.normalizedUrl);
    if (!current) {
      byUrl.set(source.normalizedUrl, source);
      continue;
    }
    byUrl.set(source.normalizedUrl, {
      ...current,
      title:
        current.title.length >= source.title.length
          ? current.title
          : source.title,
      snippet:
        current.snippet.length >= source.snippet.length
          ? current.snippet
          : source.snippet,
      extractedContent:
        current.extractedContent ||
        source.extractedContent,
      extracted:
        current.extracted || source.extracted,
      extractionAttempted: Boolean(
        current.extractionAttempted || source.extractionAttempted,
      ),
      relevanceScore: Math.max(
        current.relevanceScore,
        source.relevanceScore,
      ),
      authorityScore: Math.max(
        current.authorityScore,
        source.authorityScore,
      ),
      categories: Array.from(
        new Set([
          ...current.categories,
          ...source.categories,
        ]),
      ),
      queryIds: Array.from(
        new Set([
          ...current.queryIds,
          ...source.queryIds,
        ]),
      ),
      publishedDate:
        current.publishedDate ||
        source.publishedDate,
    });
  }
  return Array.from(byUrl.values())
    .sort(
      (a, b) =>
        (
          b.authorityScore * 0.45 +
          b.relevanceScore * 100 * 0.55
        ) -
        (
          a.authorityScore * 0.45 +
          a.relevanceScore * 100 * 0.55
        ),
    )
    .slice(0, MAX_STORED_SOURCES);
}
export async function runSearchBatch(
  queries: PlannedQuery[],
  options: { sleep?: SleepFn; alreadyCompletedIds?: string[]; now?: Date } = {},
): Promise<{
  completedQueryIds: string[];
  failedQueryIds: string[];
  sources: ResearchSource[];
}> {
  const done = new Set(options.alreadyCompletedIds ?? []);
  const selected = queries
    .filter((query) => !done.has(query.id))
    .slice(0, SEARCH_BATCH_SIZE);
  const results = await mapWithConcurrency(
    selected,
    SEARCH_CONCURRENCY,
    (query) => searchOneQuery(query, options.sleep, options.now),
  );
  return {
    completedQueryIds: results
      .filter((result) => !result.failed)
      .map((result) => result.queryId),
    failedQueryIds: results
      .filter((result) => result.failed)
      .map((result) => result.queryId),
    sources: results.flatMap(
      (result) => result.sources,
    ),
  };
}
function sourceRank(source: ResearchSource): number {
  return (
    source.authorityScore * 0.45 +
    source.relevanceScore * 100 * 0.55
  );
}
export function selectExtractionBatch(
  sources: ResearchSource[],
): ResearchSource[] {
  const candidates = sources
    .filter(
      (source) =>
        !source.extracted &&
        !source.extractedContent &&
        !source.extractionAttempted,
    )
    .sort(
      (a, b) =>
        sourceRank(b) - sourceRank(a),
    );

  const selected: ResearchSource[] = [];
  const domainCounts = new Map<string, number>();
  for (const source of candidates) {
    const count =
      domainCounts.get(source.domain) ?? 0;
    if (count >= 2) continue;
    selected.push(source);
    domainCounts.set(source.domain, count + 1);
    if (
      selected.length >= EXTRACT_BATCH_SIZE
    ) {
      break;
    }
  }
  if (
    selected.length < EXTRACT_BATCH_SIZE
  ) {
    for (const source of candidates) {
      if (
        selected.some(
          (item) =>
            item.normalizedUrl ===
            source.normalizedUrl,
        )
      ) {
        continue;
      }
      selected.push(source);
      if (
        selected.length >=
        EXTRACT_BATCH_SIZE
      ) {
        break;
      }
    }
  }
  return selected;
}
export async function extractSourceBatch(
  selected: ResearchSource[],
  inputs: Record<string, string>,
  sleep?: SleepFn,
): Promise<ResearchSource[]> {
  if (selected.length === 0) return [];
  const focusQuery = [
    inputs.projectName,
    inputs.industry,
    inputs.location,
    "market size demand competitors pricing costs regulation risks",
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 500);
  try {
    const data = await withTavilyRetry(
      () =>
        tavilyPost(
          "/extract",
          {
            urls: selected.map(
              (source) => source.url,
            ),
            query: focusQuery,
            chunks_per_source: 5,
            extract_depth: "advanced",
            format: "markdown",
            include_images: false,
            timeout: 60,
          },
          70_000,
        ),
      sleep,
    );
    const extractedByUrl = new Map<
      string,
      string
    >();
    for (const result of data?.results ?? []) {
      const normalizedUrl = normalizeUrl(
        String(result?.url ?? ""),
      );
      const content = String(
        result?.raw_content ?? "",
      )
        .trim()
        .slice(0, 12_000);
      if (normalizedUrl && content) {
        extractedByUrl.set(
          normalizedUrl,
          content,
        );
      }
    }
    return selected.map((source) => {
      const content = extractedByUrl.get(
        source.normalizedUrl,
      );
      const usable = typeof content === "string" && content.trim().length > 100;
      return {
        ...source,
        // Only a real extracted page counts as extracted. The search snippet
        // stays available in `snippet` but never counts as extracted content.
        extracted: usable,
        extractedContent: usable ? content! : null,
        extractionAttempted: true,
      };
    });
  } catch (error) {
    console.warn(
      "Tavily extraction batch failed after retries",
      error instanceof Error
        ? error.message
        : String(error),
    );
    return selected.map((source) => ({
      ...source,
      extracted: false,
      extractedContent: null,
      extractionAttempted: true,
    }));
  }
}

export function applyExtractedSources(
  allSources: ResearchSource[],
  extracted: ResearchSource[],
): ResearchSource[] {
  const replacements = new Map(
    extracted.map((source) => [
      source.normalizedUrl,
      source,
    ]),
  );
  return allSources.map(
    (source) =>
      replacements.get(source.normalizedUrl) ??
      source,
  );
}
export function computeResearchQuality(
  sources: ResearchSource[],
): ResearchQuality {
  const uniqueSources = sources.length;
  const uniqueDomains = new Set(
    sources.map((source) => source.domain),
  ).size;
  const authoritativeSources =
    sources.filter(
      (source) =>
        source.authorityScore >= 75,
    ).length;
  const extractedSources = countExtractedSources(sources);
  const coveredCategories = Array.from(
    new Set(
      sources.flatMap(
        (source) => source.categories,
      ),
    ),
  );
  const missingCategories =
    REQUIRED_CATEGORIES.filter(
      (category) =>
        !coveredCategories.includes(category),
    );
  const averageRelevance =
    sources.length > 0
      ? sources.reduce(
          (sum, source) =>
            sum + source.relevanceScore,
          0,
        ) / sources.length
      : 0;
  let score = 0;
  score += Math.min(
    25,
    (uniqueSources / 30) * 25,
  );
  score += Math.min(
    20,
    (uniqueDomains / 15) * 20,
  );
  score += Math.min(
    20,
    (authoritativeSources / 5) * 20,
  );
  score += Math.min(
    20,
    (
      coveredCategories.length /
      REQUIRED_CATEGORIES.length
    ) * 20,
  );
  score += Math.min(
    10,
    (extractedSources / 20) * 10,
  );
  score += Math.min(
    5,
    averageRelevance * 5,
  );
  const rounded = Math.round(
    clamp(score, 0, 100),
  );
  const level: ResearchQuality["level"] =
    rounded >= 75 &&
    uniqueSources >= MIN_UNIQUE_SOURCES &&
    uniqueDomains >= 8 &&
    authoritativeSources >= 3 &&
    missingCategories.length <= 1
      ? "High"
      : rounded >= 50
        ? "Medium"
        : rounded >= 25
          ? "Low"
          : "Limited";
  return {
    score: rounded,
    level,
    uniqueSources,
    uniqueDomains,
    authoritativeSources,
    extractedSources,
    coveredCategories,
    missingCategories,
    averageRelevance:
      Math.round(
        averageRelevance * 100,
      ) / 100,
    minimumSourceTargetMet:
      uniqueSources >= MIN_UNIQUE_SOURCES,
  };
}
function compactSourcesForReview(
  sources: ResearchSource[],
): unknown[] {
  return sources
    .slice()
    .sort(
      (a, b) =>
        sourceRank(b) - sourceRank(a),
    )
    .map((source) => ({
      title: source.title,
      url: source.url,
      domain: source.domain,
      categories: source.categories,
      relevanceScore: source.relevanceScore,
      authorityScore: source.authorityScore,
      content: (
        source.extractedContent ||
        source.snippet
      ).slice(0, 1_600),
    }));
}
export async function reviewResearch(
  inputs: Record<string, string>,
  state: ResearchState,
  quality: ResearchQuality,
): Promise<ResearchReview> {
  const result = await kimiStructured(
    [
      {
        role: "system",
        content: `You are reviewing internet research for a board-grade
feasibility analysis.
Determine whether the evidence is sufficient to support:
- market size and growth
- customer demand and willingness to pay
- direct competition and pricing
- startup and operating cost assumptions
- regulation and compliance
- technical feasibility
- execution risks
- local geographic context
Do not mark the research sufficient merely because many URLs exist.
Check source authority, geographic relevance, independent confirmation and
coverage of the required topics.
If evidence has material gaps, return targeted additional search queries.
Do not repeat queries already executed.`,
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            concept: conceptContext(inputs),
            quality,
            executedQueries: state.queries,
            sources:
              compactSourcesForReview(
                state.sources,
              ),
          },
          null,
          2,
        ),
      },
    ],
    "review_research_coverage",
    "Review research and request additional searches when needed.",
    reviewSchema,
    {
      reasoningEffort: "low",
      timeoutMs: 100_000,
    },
  );
  return {
    enough: Boolean(result?.enough),
    rationale: String(
      result?.rationale ?? "",
    ),
    missingAreas: Array.isArray(
      result?.missingAreas,
    )
      ? result.missingAreas.map(String)
      : [],
    unsupportedClaims: Array.isArray(
      result?.unsupportedClaims,
    )
      ? result.unsupportedClaims.map(String)
      : [],
    additionalQueries: cleanPlannedQueries(
      result?.additionalQueries ?? [],
      state.queries,
    ),
  };
}
export function researchBudgetExhausted(
  state: ResearchState,
): boolean {
  const elapsed =
    Date.now() -
    new Date(state.startedAt).getTime();
  return (
    state.round >= MAX_RESEARCH_ROUNDS ||
    state.queries.length >=
      MAX_TOTAL_QUERIES ||
    state.sources.length >=
      MAX_STORED_SOURCES ||
    elapsed >= MAX_RESEARCH_DURATION_MS
  );
}
export function shouldContinueResearch(
  state: ResearchState,
  quality: ResearchQuality,
  review: ResearchReview,
): boolean {
  if (researchBudgetExhausted(state)) {
    return false;
  }
  if (
    review.additionalQueries.length === 0
  ) {
    return false;
  }
  if (
    !quality.minimumSourceTargetMet
  ) {
    return true;
  }
  return !review.enough;
}

/**
 * Freshness audit: which freshness-sensitive categories are supported only by
 * sources older than the freshness window. Older authoritative publications are
 * kept, but the report surfaces a stale-data warning for them.
 */
export function buildFreshnessReport(
  sources: ResearchSource[],
  now: Date = new Date(),
): {
  windowYears: number;
  cutoffYear: number;
  staleCategories: ResearchCategory[];
  warnings: string[];
  datedSourceCount: number;
} {
  const cutoffYear = now.getUTCFullYear() - FRESHNESS_WINDOW_YEARS;
  const staleCategories: ResearchCategory[] = [];
  for (const category of FRESHNESS_SENSITIVE_CATEGORIES) {
    const inCategory = (sources ?? []).filter((source) =>
      source.categories.includes(category) && source.publishedDate
    );
    if (inCategory.length === 0) continue;
    if (inCategory.every((source) => isStaleSource(source, now))) {
      staleCategories.push(category);
    }
  }
  return {
    windowYears: FRESHNESS_WINDOW_YEARS,
    cutoffYear,
    staleCategories,
    warnings: staleCategories.map(
      (category) =>
        `${category.replace(/_/g, " ")} evidence relies only on sources published before ${cutoffYear}.`,
    ),
    datedSourceCount: (sources ?? []).filter((source) => Boolean(source.publishedDate)).length,
  };
}

export function buildPublicResearch(
  state: ResearchState,
  quality: ResearchQuality,
): Record<string, unknown> {
  const sorted = state.sources
    .slice()
    .sort(
      (a, b) =>
        sourceRank(b) - sourceRank(a),
    );
  // Use a character budget rather than a fixed source-count limit.
  // All source metadata remains persisted in research_state.
  const contextSources: unknown[] = [];
  let contextChars = 0;
  const maxContextChars = 160_000;
  for (const source of sorted) {
    const content = (
      source.extractedContent ||
      source.snippet
    ).slice(0, 3_000);
    if (
      contextChars + content.length >
        maxContextChars &&
      contextSources.length >=
        MIN_UNIQUE_SOURCES
    ) {
      break;
    }
    contextChars += content.length;
    contextSources.push({
      title: source.title,
      url: source.url,
      domain: source.domain,
      categories: source.categories,
      authorityScore:
        source.authorityScore,
      relevanceScore:
        source.relevanceScore,
      publishedDate:
        source.publishedDate,
      content,
    });
  }
  return {
    generatedAt:
      new Date().toISOString(),
    coverage: quality.level,
    grounded:
      quality.uniqueSources > 0,
    quality,
    freshness: buildFreshnessReport(state.sources),
    review: state.review,
    executedQueries: state.queries,
    sourceCount:
      quality.uniqueSources,
    uniqueDomainCount:
      quality.uniqueDomains,
    sources: contextSources,
    citations: sorted.map(
      (source) => ({
        title: source.title,
        url: source.url,
        source: source.domain,
        takeaway: (
          source.extractedContent ||
          source.snippet
        ).slice(0, 320),
        authorityScore:
          source.authorityScore,
        relevanceScore:
          source.relevanceScore,
        categories:
          source.categories,
      }),
    ),
    redditSignals: sorted
      .filter((source) =>
        source.domain.includes(
          "reddit.com",
        ),
      )
      .slice(0, 8)
      .map(
        (source) =>
          `${source.title} — ${source.snippet.slice(0, 260)}`,
      ),
    webSignals: sorted
      .filter(
        (source) =>
          !source.domain.includes(
            "reddit.com",
          ),
      )
      .slice(0, 30)
      .map(
        (source) =>
          `${source.title} — ${(source.extractedContent || source.snippet).slice(0, 300)}`,
      ),
  };
}
