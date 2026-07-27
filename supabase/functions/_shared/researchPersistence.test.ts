import { describe, expect, it } from "vitest";
import {
  persistReportResearchSnapshot,
  type ResearchPersistenceStore,
} from "./researchPersistence.ts";
import type {
  ResearchQuality,
  ResearchState,
} from "./researchAgent.ts";

class MemoryStore implements ResearchPersistenceStore {
  runs = new Map<string, Record<string, unknown>>();
  sources = new Map<string, Record<string, unknown>>();
  metadata = new Map<string, Record<string, unknown>>();
  failSources = false;

  async upsertRun(row: Record<string, unknown>) {
    const reportId = String(row.report_id);
    const existing = this.runs.get(reportId);
    const id = String(existing?.id ?? "run-1");
    this.runs.set(reportId, { ...existing, ...row, id });
    return id;
  }

  async upsertSources(rows: Record<string, unknown>[]) {
    if (this.failSources) throw new Error("source write failed");
    for (const row of rows) {
      this.sources.set(
        `${String(row.report_id)}:${String(row.normalized_url)}`,
        { ...row },
      );
    }
  }

  async updateReportMetadata(
    reportId: string,
    metadata: Record<string, unknown>,
  ) {
    this.metadata.set(reportId, metadata);
  }
}

const stateFixture = (count: number): ResearchState => ({
  phase: "completed",
  round: 6,
  queries: [
    {
      id: "q1",
      query: "market evidence",
      category: "market_size",
      priority: 10,
      reason: "Market sizing",
    },
  ],
  completedQueryIds: ["q1"],
  failedQueryIds: [],
  sources: Array.from({ length: count }, (_, index) => ({
    id: `source-${index}`,
    url: `https://source${index}.example/report`,
    normalizedUrl: `https://source${index}.example/report`,
    domain: `source${index}.example`,
    title: `Source ${index}`,
    snippet: `Snippet ${index}`,
    extractedContent: "x".repeat(7_000),
    relevanceScore: 0.8,
    authorityScore: index % 2 === 0 ? 90 : 55,
    categories: ["market_size", "customer_demand"],
    queryIds: ["q1"],
    publishedDate: "2026-01-01",
    extracted: true,
    extractionAttempted: true,
  })),
  review: {
    enough: true,
    rationale: "Sufficient",
    missingAreas: [],
    unsupportedClaims: [],
    additionalQueries: [],
  },
  startedAt: "2026-07-27T00:00:00.000Z",
  updatedAt: "2026-07-27T00:11:00.000Z",
});

const qualityFixture: ResearchQuality = {
  score: 86,
  level: "High",
  uniqueSources: 120,
  uniqueDomains: 120,
  authoritativeSources: 60,
  extractedSources: 120,
  coveredCategories: ["market_size", "customer_demand"],
  missingCategories: [],
  averageRelevance: 0.8,
  minimumSourceTargetMet: true,
};

describe("permanent report research persistence", () => {
  it("persists all 120 sources once and remains idempotent on retry", async () => {
    const store = new MemoryStore();
    const payload = {
      reportId: "report-1",
      analysisJobId: "job-1",
      state: stateFixture(120),
      quality: qualityFixture,
      policyVersion: "policy.v1",
      promptVersion: "prompt.v1",
      promptHash: "hash",
      modelId: "model",
      freshness: { staleCategories: [] },
      sourceSnapshotMetadata: { promptHash: "hash" },
      completedAt: "2026-07-27T00:12:00.000Z",
    };

    await persistReportResearchSnapshot(store, payload);
    await persistReportResearchSnapshot(store, payload);

    expect(store.runs.size).toBe(1);
    expect(store.sources.size).toBe(120);
    expect(store.metadata.get("report-1")).toMatchObject({
      researchPersistenceStatus: "completed",
      persistedSourceCount: 120,
      researchRunId: "run-1",
    });
  });

  it("preserves categories, query IDs, extracted state, and caps excerpts", async () => {
    const store = new MemoryStore();
    await persistReportResearchSnapshot(store, {
      reportId: "report-1",
      analysisJobId: "job-1",
      state: stateFixture(1),
      quality: { ...qualityFixture, uniqueSources: 1 },
      sourceSnapshotMetadata: {},
    });
    const source = Array.from(store.sources.values())[0];
    expect(source.categories).toEqual(["market_size", "customer_demand"]);
    expect(source.query_ids).toEqual(["q1"]);
    expect(source.extracted).toBe(true);
    expect(String(source.content_excerpt)).toHaveLength(6_000);
  });

  it("surfaces source-storage failure instead of reporting success", async () => {
    const store = new MemoryStore();
    store.failSources = true;
    await expect(persistReportResearchSnapshot(store, {
      reportId: "report-1",
      analysisJobId: "job-1",
      state: stateFixture(1),
      quality: qualityFixture,
      sourceSnapshotMetadata: {},
    })).rejects.toThrow("source write failed");
    expect(store.metadata.size).toBe(0);
  });
});
