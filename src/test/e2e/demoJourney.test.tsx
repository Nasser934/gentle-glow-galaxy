import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import Results from "@/pages/Results";
import DecisionRoom from "@/pages/DecisionRoom";
import { demoReport, DEMO_REPORT_ID } from "@/data/demoReport";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: null, session: null, loading: false, signOut: vi.fn() }),
}));

describe("synthetic hackathon demo journey", () => {
  it("opens the validated demo and continues to anonymous Judge Mode without saving", async () => {
    render(
      <MemoryRouter initialEntries={["/demo"]}>
        <Routes>
          <Route path="/demo" element={<Results />} />
          <Route path="/decision-room/:reportId" element={<DecisionRoom />} />
        </Routes>
      </MemoryRouter>,
    );

    expect((await screen.findAllByText("Illustrative Demo — Synthetic Data")).length).toBeGreaterThan(0);
    expect(screen.getByText(/This public path never writes demo data to the database/i)).toBeInTheDocument();
    expect(screen.getAllByText(/7\.5/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /Open 90-Second Judge Mode/i }));

    await waitFor(() => {
      expect(screen.getAllByText(/Executive Decision Room/i).length).toBeGreaterThan(0);
    });
    expect(screen.getByText(/Human approval remains separate/i)).toBeInTheDocument();
    expect(screen.getByText(/Synthetic demonstration — not measured organizational results/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Back to demo/i }).length).toBeGreaterThan(0);
  });

  it("never exposes an unbounded break-even horizon in Judge Mode", async () => {
    const originalBreakEven = demoReport.financials.breakEvenSummary;
    demoReport.financials.breakEvenSummary = "24000000 months";

    try {
      render(
        <MemoryRouter initialEntries={[`/decision-room/${DEMO_REPORT_ID}`]}>
          <Routes>
            <Route path="/decision-room/:reportId" element={<DecisionRoom />} />
          </Routes>
        </MemoryRouter>,
      );

      await screen.findAllByText(/Executive Decision Room/i);
      expect(screen.queryByText(/24000000 months/i)).not.toBeInTheDocument();
      expect(screen.getAllByText(/Requires validation/i).length).toBeGreaterThan(0);
    } finally {
      demoReport.financials.breakEvenSummary = originalBreakEven;
    }
  });
});
