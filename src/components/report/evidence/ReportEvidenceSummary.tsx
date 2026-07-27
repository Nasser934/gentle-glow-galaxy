import { AlertTriangle, CheckCircle2, Gauge, Layers3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FeasibilityReport } from "@/types/analysis";

const metric = (label: string, value: string, detail?: string) => (
  <div className="min-w-0 rounded-lg border border-border bg-muted/20 p-3">
    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {label}
    </div>
    <div className="mt-1 break-words font-display text-lg font-semibold text-foreground">
      {value}
    </div>
    {detail && <div className="mt-1 text-xs text-muted-foreground">{detail}</div>}
  </div>
);

export function ReportEvidenceSummary({
  report,
}: {
  report: FeasibilityReport;
}) {
  const research = report.research as Record<string, any> | undefined;
  const quality = research?.quality as Record<string, any> | undefined;
  const baseline = report.resolvedConcept?.selectedBaselineScenario;
  const unresolved = report.resolvedConcept?.unresolvedPrivateDecisions ?? [];
  const mix = report.evidenceMix;

  return (
    <Card data-testid="report-evidence-summary">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Layers3 className="h-4 w-4 text-primary" />
          Decision and evidence summary
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Feasibility, evidence readiness, and brief clarity are separate signals.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {metric(
            "FMART-O feasibility",
            `${report.scores.overall.toFixed(1)} / 10`,
            report.scores.verdict,
          )}
          {metric(
            "Decision readiness",
            report.decisionReadinessScore != null
              ? `${report.decisionReadinessScore.toFixed(1)} / 10`
              : "Not available",
            report.decisionReadinessStatus,
          )}
          {metric(
            "Research quality",
            quality?.score != null ? `${quality.score} / 100` : "Legacy snapshot",
            quality?.level,
          )}
          {metric(
            "Brief Clarity",
            report.inputQualityScore != null
              ? `${report.inputQualityScore}%`
              : "Not available",
            "Does not change FMART-O",
          )}
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-lg border border-border p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Gauge className="h-4 w-4 text-primary" />
              Analytical baseline
            </div>
            {baseline ? (
              <>
                <div className="mt-2 font-medium text-foreground">{baseline.name}</div>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {baseline.description}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[baseline.targetCustomer, baseline.targetGeography, baseline.businessModel]
                    .filter(Boolean)
                    .map((value) => (
                      <Badge key={value} variant="outline" className="max-w-full whitespace-normal">
                        {value}
                      </Badge>
                    ))}
                </div>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                This report predates the resolved-baseline format.
              </p>
            )}
          </div>

          <div className="rounded-lg border border-border p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              {unresolved.length > 0
                ? <AlertTriangle className="h-4 w-4 text-warning" />
                : <CheckCircle2 className="h-4 w-4 text-success" />}
              Unresolved private decisions
            </div>
            {unresolved.length > 0 ? (
              <ul className="mt-2 space-y-2 text-sm">
                {unresolved.slice(0, 4).map((decision) => (
                  <li key={`${decision.field}-${decision.userAction}`}>
                    <span className="font-medium text-foreground">{decision.field}: </span>
                    <span className="text-muted-foreground">{decision.userAction}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                No high-impact private decisions are listed in this report.
              </p>
            )}
          </div>
        </div>

        {mix && (
          <div className="rounded-lg border border-border p-4">
            <div className="text-sm font-semibold text-foreground">Evidence mix</div>
            <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-muted">
              <div className="bg-primary" style={{ width: `${mix.userInputPercent}%` }} />
              <div className="bg-success" style={{ width: `${mix.webResearchPercent}%` }} />
              <div className="bg-warning" style={{ width: `${mix.aiAssumptionPercent}%` }} />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>Your inputs {mix.userInputPercent}%</span>
              <span>Public research {mix.webResearchPercent}%</span>
              <span>Analytical assumptions {mix.aiAssumptionPercent}%</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
