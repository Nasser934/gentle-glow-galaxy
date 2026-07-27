import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Results from "@/pages/Results";
import { normalizeExternalAnalysis } from "@/lib/reportContract";
import {
  canonicalInputsFixture,
  canonicalReportFixture,
  legacyThermoFlowExternalPayload,
} from "@/test/fixtures/reports";

const mocks = vi.hoisted(() => ({
  getReportById: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "owner-user" } }),
}));

vi.mock("@/lib/reports", () => ({
  getReportById: mocks.getReportById,
  saveReport: vi.fn(),
  listReportVersions: vi.fn().mockResolvedValue([]),
  restoreReportGroup: vi.fn(),
  persistCanonicalRepair: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/components/report/InteractiveDashboard", () => ({
  InteractiveDashboard: ({
    report,
    inputs,
  }: {
    report: { reportId: string };
    inputs: { projectName: string };
  }) => (
    <div data-testid="interactive-dashboard">
      {inputs.projectName} · {report.reportId}
    </div>
  ),
}));

vi.mock("@/components/report/evidence/EvidencePanel", () => ({
  WhyThisScore: () => <div>Why this score</div>,
  ReportFamilyPanel: () => <div>Report family</div>,
  VersionComparison: () => <div>Version comparison</div>,
}));

vi.mock("@/components/report/evidence/ReportEvidenceSummary", () => ({
  ReportEvidenceSummary: () => (
    <div data-testid="report-evidence-summary">Evidence summary</div>
  ),
}));

vi.mock("@/components/report/research/ResearchSourcesPanel", () => ({
  ResearchSourcesPanel: () => <div>Research source list</div>,
}));

vi.mock("@/components/report/StatusControl", () => ({
  StatusControl: () => <div>Status control</div>,
}));

vi.mock("@/components/report/workspace/WorkspaceHeader", () => ({
  WorkspaceHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

vi.mock("@/components/report/workspace/ActivityTab", () => ({
  ActivityTab: () => <div>Activity</div>,
}));

vi.mock("sonner", () => ({
  toast: {
    loading: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

const reportRow = (output: unknown, inputs: unknown = canonicalInputsFixture) => ({
  id: "abe31755-972d-4b8b-86e3-62657db46f1d",
  display_id: "CAI-2026-00000094",
  slug: "report-slug",
  user_id: "owner-user",
  title: "ThermoFlow DC",
  industry: "Infrastructure",
  inputs,
  output,
  status: "draft",
  is_public: false,
  parent_report_id: null,
  archived_at: null,
  created_at: "2026-07-23T00:00:00.000Z",
  updated_at: "2026-07-23T00:00:00.000Z",
});

const renderReportRoute = () => render(
  <MemoryRouter initialEntries={["/reports/abe31755-972d-4b8b-86e3-62657db46f1d"]}>
    <Routes>
      <Route path="/reports/:reportId" element={<Results />} />
    </Routes>
  </MemoryRouter>,
);

describe("report route compatibility guard", () => {
  beforeEach(() => {
    mocks.getReportById.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders a valid in-app report", async () => {
    mocks.getReportById.mockResolvedValue(reportRow(canonicalReportFixture));

    renderReportRoute();

    expect(await screen.findByTestId("interactive-dashboard")).toHaveTextContent(
      "Project Atlas — Internal Field-Ops Platform",
    );
    expect(screen.getAllByTestId("report-evidence-summary")).toHaveLength(1);
    expect(screen.getByRole("tab", { name: "Research & Sources" })).toBeInTheDocument();
  });

  it("renders a normalized external-agent report", async () => {
    const normalized = normalizeExternalAnalysis(legacyThermoFlowExternalPayload, {
      reportId: "CAI-2026-00000094",
    });
    if (!("output" in normalized)) throw new Error("external fixture did not normalize");
    mocks.getReportById.mockResolvedValue(reportRow(normalized.output, normalized.inputs));

    renderReportRoute();

    expect(await screen.findByTestId("interactive-dashboard")).toHaveTextContent(
      "ThermoFlow DC · CAI-2026-00000094",
    );
    expect(screen.queryByText("Report data is incompatible")).not.toBeInTheDocument();
  });

  it("shows a compatibility error instead of crashing when scores are missing", async () => {
    const broken = structuredClone(canonicalReportFixture) as unknown as Record<string, unknown>;
    delete broken.scores;
    mocks.getReportById.mockResolvedValue(reportRow(broken));

    renderReportRoute();

    expect(await screen.findByText("Report data is incompatible")).toBeInTheDocument();
    expect(screen.getByText("output.scores")).toBeInTheDocument();
    expect(screen.getByText("CAI-2026-00000094")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to My Analyses/i })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    expect(screen.queryByTestId("interactive-dashboard")).not.toBeInTheDocument();
  });

  it.each([
    "financials",
    "market",
    "risks",
    "fundingMix",
    "competitors",
    "recommendations",
    "nextSteps",
  ])("recovers instead of crashing when %s is missing", async (field) => {
    const broken = structuredClone(canonicalReportFixture) as unknown as Record<string, unknown>;
    delete broken[field];
    mocks.getReportById.mockResolvedValue(reportRow(broken));

    renderReportRoute();

    // Missing optional sections are repaired deterministically on read, so the
    // workspace renders with empty sections instead of a compatibility error.
    await waitFor(() => {
      expect(screen.getByTestId("interactive-dashboard")).toBeInTheDocument();
    });
    expect(screen.queryByText("Report data is incompatible")).not.toBeInTheDocument();
  });
});
