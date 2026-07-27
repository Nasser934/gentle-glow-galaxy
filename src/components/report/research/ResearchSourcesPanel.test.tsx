import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ResearchSourcesPanel } from "./ResearchSourcesPanel";
import { canonicalReportFixture } from "@/test/fixtures/reports";
import type {
  LegacyResearchSnapshot,
  ReportResearchRun,
  ReportResearchSource,
} from "@/lib/reportResearch";

const mocks = vi.hoisted(() => ({
  getRun: vi.fn(),
  listSources: vi.fn(),
  legacy: vi.fn(),
}));

vi.mock("@/lib/reportResearch", () => ({
  getReportResearchRun: mocks.getRun,
  listReportResearchSources: mocks.listSources,
  legacyResearchSnapshot: mocks.legacy,
}));

const runFixture: ReportResearchRun = {
  id: "run-1",
  report_id: "report-1",
  analysis_job_id: "job-1",
  policy_version: "policy.v1",
  prompt_version: "prompt.v1",
  prompt_hash: "hash",
  model_id: "model",
  research_quality: {
    score: 86,
    level: "High",
    coveredCategories: ["market_size", "competitors"],
    missingCategories: [],
  },
  research_review: {
    enough: true,
    rationale: "Evidence covers the selected scenario.",
    missingAreas: [],
    unsupportedClaims: [],
  },
  freshness: { warnings: [] },
  executed_queries: [
    {
      id: "q1",
      query: "market size",
      category: "market_size",
      priority: 10,
      reason: "Sizing",
      status: "completed",
    },
  ],
  source_count: 120,
  unique_domain_count: 76,
  authoritative_source_count: 31,
  extracted_source_count: 28,
  research_round_count: 6,
  started_at: "2026-07-27T00:00:00.000Z",
  completed_at: "2026-07-27T00:11:00.000Z",
  created_at: "2026-07-27T00:11:00.000Z",
};

const sourceFixture = (index: number): ReportResearchSource => ({
  id: `source-${index}`,
  research_run_id: "run-1",
  report_id: "report-1",
  normalized_url: `https://example.com/${index}`,
  url: `https://example.com/${index}`,
  domain: "example.com",
  title: `Source ${index}`,
  snippet: `Snippet ${index}`,
  content_excerpt: `Excerpt ${index}`,
  relevance_score: 0.8,
  authority_score: 90,
  categories: ["market_size"],
  query_ids: ["q1"],
  published_date: "2026-01-01",
  extracted: true,
  extraction_attempted: true,
  source_rank: 85,
  created_at: "2026-07-27T00:00:00.000Z",
});

const emptyLegacy: LegacyResearchSnapshot = {
  legacy: true,
  run: {
    id: "legacy",
    report_id: "legacy",
    research_quality: {},
    research_review: {},
    freshness: {},
    executed_queries: [],
    source_count: 0,
    unique_domain_count: 0,
    authoritative_source_count: 0,
    extracted_source_count: 0,
    research_round_count: 0,
    started_at: null,
    completed_at: null,
  },
  sources: [],
};

describe("Research & Sources", () => {
  beforeEach(() => {
    mocks.getRun.mockReset();
    mocks.listSources.mockReset();
    mocks.legacy.mockReset();
    mocks.legacy.mockReturnValue(emptyLegacy);
  });

  afterEach(cleanup);

  it("loads a 120-source report in pages of 20", async () => {
    mocks.getRun.mockResolvedValue(runFixture);
    mocks.listSources.mockResolvedValue({
      sources: Array.from({ length: 20 }, (_, index) => sourceFixture(index)),
      count: 120,
    });

    render(
      <ResearchSourcesPanel reportId="report-1" report={canonicalReportFixture} />,
    );

    expect(await screen.findAllByTestId("research-source")).toHaveLength(20);
    expect(screen.getByText("120 matching · 120 total")).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 6")).toBeInTheDocument();
  });

  it("passes filters and pagination to the repository", async () => {
    mocks.getRun.mockResolvedValue(runFixture);
    mocks.listSources.mockResolvedValue({
      sources: Array.from({ length: 20 }, (_, index) => sourceFixture(index)),
      count: 120,
    });
    render(
      <ResearchSourcesPanel reportId="report-1" report={canonicalReportFixture} />,
    );
    await screen.findAllByTestId("research-source");

    fireEvent.change(screen.getByLabelText("Category"), {
      target: { value: "market_size" },
    });
    await waitFor(() => {
      expect(mocks.listSources).toHaveBeenLastCalledWith(
        "report-1",
        expect.objectContaining({ category: "market_size", page: 0, pageSize: 20 }),
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    await waitFor(() => {
      expect(mocks.listSources).toHaveBeenLastCalledWith(
        "report-1",
        expect.objectContaining({ category: "market_size", page: 1 }),
      );
    });
  });

  it("uses a labelled legacy snapshot when no durable run exists", async () => {
    const legacySource = sourceFixture(1);
    mocks.getRun.mockResolvedValue(null);
    mocks.legacy.mockReturnValue({
      ...emptyLegacy,
      run: { ...emptyLegacy.run, source_count: 1, unique_domain_count: 1 },
      sources: [legacySource],
    });

    render(
      <ResearchSourcesPanel reportId="legacy-report" report={canonicalReportFixture} />,
    );

    expect(await screen.findByText(/Legacy research snapshot/i)).toBeInTheDocument();
    expect(screen.getByText("Source 1")).toBeInTheDocument();
    expect(mocks.listSources).not.toHaveBeenCalled();
  });

  it("keeps long URLs safe and wraps them on mobile", async () => {
    const long = {
      ...sourceFixture(1),
      url: `https://example.com/${"very-long-path-".repeat(20)}`,
    };
    mocks.getRun.mockResolvedValue(runFixture);
    mocks.listSources.mockResolvedValue({ sources: [long], count: 1 });

    render(
      <ResearchSourcesPanel reportId="report-1" report={canonicalReportFixture} />,
    );

    const link = await screen.findByText(long.url);
    expect(link).toHaveClass("break-all");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders a safe empty state for reports without sources", async () => {
    mocks.getRun.mockResolvedValue(null);
    render(
      <ResearchSourcesPanel reportId="external-report" report={canonicalReportFixture} />,
    );
    expect(await screen.findByText("No saved sources match this view.")).toBeInTheDocument();
  });
});
