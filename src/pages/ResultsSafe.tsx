import { Component, type ReactNode } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowLeft, RefreshCw } from "lucide-react";
import ResultsV2 from "./ResultsV2";
import { Button } from "@/components/ui/button";
import { generateLocalReport } from "@/lib/localReport";
import type { ConceptInputs, FeasibilityReport } from "@/types/analysis";

type LocationState = {
  report?: Partial<FeasibilityReport>;
  inputs?: ConceptInputs;
  slug?: string;
  reportId?: string;
  isPublic?: boolean;
  repaired?: boolean;
};

type BoundaryProps = {
  children: ReactNode;
  inputs: ConceptInputs;
};

type BoundaryState = {
  crashed: boolean;
};

class ResultsBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { crashed: false };

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Results page crashed", error);
  }

  render() {
    if (!this.state.crashed) return this.props.children;
    return <ResultsFallback inputs={this.props.inputs} />;
  }
}

const isValidReport = (report: Partial<FeasibilityReport> | undefined): report is FeasibilityReport => {
  return Boolean(
    report &&
    report.reportId &&
    report.scores &&
    typeof report.scores.overall === "number" &&
    report.scores.verdict &&
    report.market &&
    report.customer &&
    report.financials &&
    report.financials.capExTotal &&
    report.financials.investmentRange &&
    report.research &&
    Array.isArray(report.competitors) &&
    Array.isArray(report.risks) &&
    Array.isArray(report.fundingMix) &&
    Array.isArray(report.recommendations) &&
    Array.isArray(report.nextSteps)
  );
};

function ResultsFallback({ inputs }: { inputs: ConceptInputs }) {
  const navigate = useNavigate();
  const openSafeReport = () => {
    navigate("/results", {
      replace: true,
      state: { inputs, report: generateLocalReport(inputs), repaired: true },
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
        <AlertTriangle className="mx-auto h-10 w-10 text-amber-600" />
        <h1 className="mt-4 font-display text-2xl font-bold text-foreground">Report view recovered</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The AI returned data that the dashboard could not render safely. Open a template-aligned local report instead.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button onClick={openSafeReport} className="gap-2"><RefreshCw className="h-4 w-4" /> Open safe report</Button>
          <Button variant="outline" onClick={() => navigate("/analyze")} className="gap-2"><ArrowLeft className="h-4 w-4" /> Back to Analyze</Button>
        </div>
      </div>
    </div>
  );
}

export default function ResultsSafe() {
  const location = useLocation();
  const state = (location.state ?? {}) as LocationState;

  if (!state.inputs) return <Navigate to="/analyze" replace />;

  if (!isValidReport(state.report) && !state.repaired) {
    return (
      <Navigate
        to="/results"
        replace
        state={{ ...state, report: generateLocalReport(state.inputs), repaired: true }}
      />
    );
  }

  return (
    <ResultsBoundary inputs={state.inputs}>
      <ResultsV2 />
    </ResultsBoundary>
  );
}
