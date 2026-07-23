import { Component, type ErrorInfo, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { ReportCompatibilityPanel } from "@/components/report/ReportCompatibilityPanel";

interface BoundaryProps {
  children: ReactNode;
  reportId?: string;
}

interface BoundaryState {
  failed: boolean;
}

class ReportErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[report-route] render failed", {
      name: error.name,
      componentStack: info.componentStack,
    });
  }

  render() {
    if (this.state.failed) {
      return (
        <ReportCompatibilityPanel
          reportId={this.props.reportId}
          issues={[{
            path: "report.render",
            message: "An unexpected report rendering error occurred.",
          }]}
        />
      );
    }
    return this.props.children;
  }
}

export function ReportRouteErrorBoundary({ children }: { children: ReactNode }) {
  const { reportId, slug } = useParams();
  return (
    <ReportErrorBoundary reportId={reportId || slug}>
      {children}
    </ReportErrorBoundary>
  );
}
