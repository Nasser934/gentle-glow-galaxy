import { AlertTriangle, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import type { ReportValidationIssue } from "@/lib/reportContract";

export interface ReportCompatibilityPanelProps {
  reportId?: string | null;
  issues: ReportValidationIssue[];
}

export function ReportCompatibilityPanel({
  reportId,
  issues,
}: ReportCompatibilityPanelProps) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center bg-background px-4 py-10">
      <section
        role="alert"
        aria-labelledby="report-compatibility-title"
        className="w-full max-w-xl rounded-xl border border-destructive/30 bg-card p-6 shadow-sm"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1
              id="report-compatibility-title"
              className="font-display text-xl font-semibold text-foreground"
            >
              Report data is incompatible
            </h1>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              This report cannot be displayed safely because required report fields are
              missing or invalid. No data has been hidden or changed.
            </p>
          </div>
        </div>

        <dl className="mt-5 rounded-lg border border-border bg-muted/25 px-4 py-3 text-sm">
          <div className="flex flex-wrap gap-x-2">
            <dt className="font-medium text-foreground">Report ID:</dt>
            <dd className="break-all font-mono text-muted-foreground">
              {reportId || "Unavailable"}
            </dd>
          </div>
        </dl>

        <div className="mt-4">
          <h2 className="text-sm font-medium text-foreground">Missing or invalid fields</h2>
          <ul className="mt-2 max-h-56 space-y-2 overflow-y-auto rounded-lg border border-border bg-background/70 p-3">
            {issues.length > 0 ? issues.map((issue, index) => (
              <li key={`${issue.path}-${index}`} className="text-sm">
                <code className="break-all font-mono text-xs font-semibold text-destructive">
                  {issue.path}
                </code>
                <span className="ml-2 text-muted-foreground">{issue.message}</span>
              </li>
            )) : (
              <li className="text-sm text-muted-foreground">
                report.render — An unexpected report rendering error occurred.
              </li>
            )}
          </ul>
        </div>

        <Button asChild variant="outline" className="mt-5 gap-2">
          <Link to="/dashboard">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to My Analyses
          </Link>
        </Button>
      </section>
    </div>
  );
}
