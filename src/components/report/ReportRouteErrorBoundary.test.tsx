import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ReportRouteErrorBoundary } from "@/components/report/ReportRouteErrorBoundary";

const BrokenReport = () => {
  throw new Error("simulated report render failure");
};

describe("ReportRouteErrorBoundary", () => {
  it("replaces an uncaught route exception with the compatibility panel", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <MemoryRouter initialEntries={["/reports/abe31755-972d-4b8b-86e3-62657db46f1d"]}>
        <Routes>
          <Route
            path="/reports/:reportId"
            element={(
              <ReportRouteErrorBoundary>
                <BrokenReport />
              </ReportRouteErrorBoundary>
            )}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Report data is incompatible")).toBeInTheDocument();
    expect(screen.getByText("report.render")).toBeInTheDocument();
    expect(screen.getByText("abe31755-972d-4b8b-86e3-62657db46f1d")).toBeInTheDocument();
    consoleError.mockRestore();
  });
});
