import { Navigate, useLocation } from "react-router-dom";
import ResultsV2 from "./ResultsV2";
import { generateLocalReport } from "@/lib/localReport";
import type { ConceptInputs, FeasibilityReport } from "@/types/analysis";

type LocationState = {
  report?: Partial<FeasibilityReport>;
  inputs?: ConceptInputs;
  slug?: string;
  reportId?: string;
  isPublic?: boolean;
};

const isValidReport = (report: Partial<FeasibilityReport> | undefined): report is FeasibilityReport => {
  return Boolean(
    report &&
    report.reportId &&
    report.scores &&
    typeof report.scores.overall === "number" &&
    report.market &&
    report.financials &&
    Array.isArray(report.risks) &&
    Array.isArray(report.recommendations) &&
    Array.isArray(report.nextSteps)
  );
};

export default function ResultsSafe() {
  const location = useLocation();
  const state = (location.state ?? {}) as LocationState;

  if (!state.inputs) return <Navigate to="/analyze" replace />;

  if (!isValidReport(state.report)) {
    const safeReport = generateLocalReport(state.inputs);
    return <ResultsV2 key="safe-results" />;
  }

  return <ResultsV2 />;
}
