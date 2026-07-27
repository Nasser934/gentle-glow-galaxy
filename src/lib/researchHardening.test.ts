import { describe, expect, it } from "vitest";
import {
  authorityScore,
  isDomainOrSubdomain,
  isExtractedSource,
  countExtractedSources,
  freshnessStartDate,
  isStaleSource,
  buildFreshnessReport,
  ensureMinimumQueryPlan,
  createInitialResearchState,
  MIN_INITIAL_QUERIES,
  MAX_INITIAL_QUERIES,
  isRetryableTavilyError,
  tavilyRetryDelayMs,
  withTavilyRetry,
  TavilyError,
  type ResearchSource,
} from "../../supabase/functions/_shared/researchAgent.ts";
import {
  computeDecisionReadiness,
  decisionReadinessStatus,
} from "../../supabase/functions/_shared/analysisCore.ts";

const source = (over: Partial<ResearchSource> = {}): ResearchSource => ({
  url: "https://example.com/a",
  normalizedUrl: "example.com/a",
  domain: "example.com",
  title: "t",
  snippet: "s".repeat(300),
  extractedContent: null,
  relevanceScore: 0.8,
  authorityScore: 55,
  categories: ["market_size"],
  queryIds: ["q1"],
  publishedDate: null,
  extracted: false,
  extractionAttempted: false,
  ...over,
});

describe("domain authority matching", () => {
  it("does not treat lookalike domains as authoritative", () => {
    expect(isDomainOrSubdomain("fakeun.org", "un.org")).toBe(false);
    expect(authorityScore("fakeun.org")).toBe(55);
    expect(authorityScore("notgov.com")).toBe(55);
  });
  it("matches exact domains and true subdomains", () => {
    expect(isDomainOrSubdomain("data.worldbank.org", "worldbank.org")).toBe(true);
    expect(authorityScore("www.un.org")).toBe(90);
    expect(authorityScore("stats.gov.sa")).toBe(100);
  });
});

describe("extraction accounting", () => {
  it("does not count failed extractions", () => {
    const failed = source({ extracted: false, extractionAttempted: true });
    const snippetOnly = source({ extracted: true, extractedContent: "short" });
    const real = source({ extracted: true, extractedContent: "x".repeat(500) });
    expect(isExtractedSource(failed)).toBe(false);
    expect(isExtractedSource(snippetOnly)).toBe(false);
    expect(isExtractedSource(real)).toBe(true);
    expect(countExtractedSources([failed, snippetOnly, real])).toBe(1);
  });
});

describe("tavily retries", () => {
  it("retries 429 and 5xx, not 400", () => {
    expect(isRetryableTavilyError(new TavilyError(429, "rate"))).toBe(true);
    expect(isRetryableTavilyError(new TavilyError(503, "down"))).toBe(true);
    expect(isRetryableTavilyError(new TavilyError(400, "bad"))).toBe(false);
  });
  it("honours Retry-After and backs off otherwise", () => {
    expect(tavilyRetryDelayMs(1, new TavilyError(429, "x", 7))).toBe(7000);
    expect(tavilyRetryDelayMs(1, new TavilyError(500, "x"))).toBe(2000);
    expect(tavilyRetryDelayMs(2, new TavilyError(500, "x"))).toBe(5000);
  });
  it("makes at most three attempts", async () => {
    let calls = 0;
    const slept: number[] = [];
    await expect(
      withTavilyRetry(async () => {
        calls++;
        throw new TavilyError(503, "down");
      }, async (ms) => { slept.push(ms); }),
    ).rejects.toBeInstanceOf(TavilyError);
    expect(calls).toBe(3);
    expect(slept).toEqual([2000, 5000]);
  });
  it("stops retrying once a call succeeds", async () => {
    let calls = 0;
    const value = await withTavilyRetry(async () => {
      calls++;
      if (calls < 2) throw new TavilyError(500, "x");
      return "ok";
    }, async () => {});
    expect(value).toBe("ok");
    expect(calls).toBe(2);
  });
});

describe("round counting", () => {
  it("starts at round 1", () => {
    expect(createInitialResearchState().round).toBe(1);
  });
});

describe("minimum query plan", () => {
  it("tops a thin plan up to the minimum with context-specific queries", () => {
    const planned = ensureMinimumQueryPlan(
      [{ id: "a", query: "solar market size saudi arabia", category: "market_size", priority: 9, reason: "r" }],
      { industry: "solar energy", location: "Saudi Arabia", projectName: "Helios" },
    );
    expect(planned.length).toBeGreaterThanOrEqual(MIN_INITIAL_QUERIES);
    expect(planned.length).toBeLessThanOrEqual(MAX_INITIAL_QUERIES);
    expect(new Set(planned.map((q) => q.query.toLowerCase())).size).toBe(planned.length);
    expect(planned.every((q) => q.query.length > 8)).toBe(true);
    expect(planned.slice(1).every((q) => /solar energy|saudi arabia/i.test(q.query))).toBe(true);
  });
  it("caps an oversized plan", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      id: `q${i}`, query: `query number ${i}`, category: "market_size" as const, priority: 5, reason: "r",
    }));
    expect(ensureMinimumQueryPlan(many, {}).length).toBe(MAX_INITIAL_QUERIES);
  });
});

describe("freshness", () => {
  const now = new Date("2026-07-27T00:00:00Z");
  it("applies a lookback window only to sensitive categories", () => {
    expect(freshnessStartDate("market_size", now)).toBe("2023-01-01");
    expect(freshnessStartDate("local_context", now)).toBeNull();
  });
  it("flags old sources but not undated ones", () => {
    expect(isStaleSource({ publishedDate: "2019-01-01" }, now)).toBe(true);
    expect(isStaleSource({ publishedDate: "2025-01-01" }, now)).toBe(false);
    expect(isStaleSource({ publishedDate: null }, now)).toBe(false);
  });
  it("warns when a category has only stale evidence", () => {
    const report = buildFreshnessReport(
      [
        source({ publishedDate: "2018-05-01", categories: ["market_size"] }),
        source({ publishedDate: "2025-05-01", categories: ["competitors"] }),
      ],
      now,
    );
    expect(report.staleCategories).toContain("market_size");
    expect(report.staleCategories).not.toContain("competitors");
    expect(report.warnings[0]).toContain("2023");
  });
});

describe("decision readiness", () => {
  it("is separate from the feasibility verdict", () => {
    const report = {
      scores: { overall: 8.2, confidence: { market: 30, financial: 30, achievability: 30, risk: 30, timing: 30, operational: 30 } },
      inputQualityScore: 40,
    };
    const { decisionReadinessScore, decisionReadinessStatus: status } = computeDecisionReadiness(report, 20);
    expect(report.scores.overall).toBe(8.2);
    expect(decisionReadinessScore).toBeCloseTo(2.9, 1);
    expect(status).toBe("INSUFFICIENT EVIDENCE");
  });
  it("rewards strong evidence", () => {
    const report = {
      scores: { confidence: { market: 90, financial: 90, achievability: 90, risk: 90, timing: 90, operational: 90 } },
      inputQualityScore: 85,
    };
    const { decisionReadinessScore, decisionReadinessStatus: status } = computeDecisionReadiness(report, 80);
    expect(decisionReadinessScore).toBeGreaterThanOrEqual(7.5);
    expect(status).toBe("READY");
  });
  it("maps bands correctly", () => {
    expect(decisionReadinessStatus(7.5)).toBe("READY");
    expect(decisionReadinessStatus(5)).toBe("NEEDS VALIDATION");
    expect(decisionReadinessStatus(4.9)).toBe("INSUFFICIENT EVIDENCE");
  });
});
