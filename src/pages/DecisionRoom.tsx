import { useEffect, useState, type ReactNode } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft, CheckCircle2, ChevronRight, ExternalLink,
  Gauge, Loader2, MessageSquare, ShieldAlert, Sparkles, Target, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getReportById, type ReportRow } from "@/lib/reports";
import { formatConfidence, confidencePercent, isInternalProject } from "@/lib/format";
import { demoReport, demoInputs, DEMO_REPORT_ID } from "@/data/demoReport";
import type { FeasibilityReport, ConceptInputs } from "@/types/analysis";
import { ensureEvidenceFields } from "@/lib/evidence";
import { EvidenceSections } from "@/components/report/evidence/EvidencePanel";
import { StatusControl } from "@/components/report/StatusControl";
import { useAuth } from "@/contexts/AuthContext";

const verdictTone = (v: string) =>
  v === "PROCEED" ? "bg-success text-success-foreground"
  : v === "PROCEED WITH CAUTION" || v === "REVISE" ? "bg-warning text-warning-foreground"
  : "bg-destructive text-destructive-foreground";

const DIM_KEYS = ["financial", "market", "achievability", "operational", "risk", "timing"] as const;
const DIM_LABELS: Record<string, string> = {
  financial: "Financial", market: "Market", achievability: "Achievability",
  operational: "Operational", risk: "Risk (inv.)", timing: "Timing",
};

const FINDING_KEYS = {
  financial: "financialFinding",
  market: "marketFinding",
  achievability: "achievabilityFinding",
  operational: "operationalFinding",
  risk: "riskFinding",
  timing: "timingFinding",
} as const;

const dimensionEvidenceCount = (report: FeasibilityReport, dimension: typeof DIM_KEYS[number]) => {
  const sourceIds = new Set(
    (report.claims ?? [])
      .filter((claim) => claim.dimensions?.includes(dimension))
      .flatMap((claim) => claim.supportingSourceIds),
  );
  return sourceIds.size;
};

const Section = ({ title, icon: Icon, children, hint }: { title: string; icon: LucideIcon; children: ReactNode; hint?: string }) => (
  <Card>
    <CardHeader className="pb-2">
      <CardTitle className="flex items-center gap-2 text-base">
        <Icon className="h-4 w-4 text-primary" /> {title}
      </CardTitle>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </CardHeader>
    <CardContent>{children}</CardContent>
  </Card>
);

const DecisionRoom = () => {
  const { reportId = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [row, setRow] = useState<{ inputs: ConceptInputs; output: FeasibilityReport; title: string; slug: string | null; demo: boolean; ownerId: string | null; status: ReportRow["status"] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    setLoadError(false);
    (async () => {
      try {
        if (reportId === DEMO_REPORT_ID) {
          if (!cancelled) setRow({ inputs: demoInputs, output: demoReport, title: demoInputs.projectName, slug: null, demo: true, ownerId: null, status: "draft" });
          return;
        }
        const r: ReportRow | null = await getReportById(reportId);
        if (!r) { if (!cancelled) setNotFound(true); return; }
        if (!cancelled) setRow({ inputs: r.inputs, output: r.output, title: r.title, slug: r.slug, demo: false, ownerId: r.user_id, status: r.status });
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [reportId, retryKey]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
        <div>
          <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-warning" />
          <h2 className="font-display text-xl font-medium">Could not load the Executive Decision Room</h2>
          <p className="mt-1 text-sm text-muted-foreground">The database request failed. Retry safely; no report data was changed.</p>
          <Button onClick={() => setRetryKey((value) => value + 1)} className="mt-4">Retry</Button>
        </div>
      </div>
    );
  }
  if (notFound || !row) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
        <div>
          <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <h2 className="font-display text-xl font-medium">Report data not found</h2>
          <p className="mt-1 text-sm text-muted-foreground">This Decision Room link is invalid or the report has been deleted.</p>
          <Button onClick={() => navigate("/dashboard")} className="mt-4">Back to Dashboard</Button>
        </div>
      </div>
    );
  }

  const { inputs, output: rawReport, title, demo, ownerId, status } = row;
  const canEditStatus = !demo && !!user && !!ownerId && user.id === ownerId;
  const report = ensureEvidenceFields(rawReport, inputs);
  const overallConfPct = confidencePercent(
    report.scores.confidence
      ? Object.values(report.scores.confidence).reduce((a, b) => a + (Number(b) || 0), 0) / 6
      : null,
  );
  const overallConf = overallConfPct != null ? `${overallConfPct}%` : "—";

  const strongestSupportedClaim = report.claims?.find(
    (claim) => claim.supportStatus === "supported" && claim.supportingSourceIds.length > 0,
  );
  const strongestReason = strongestSupportedClaim?.claimText
    || "No directly supported reason is available yet; validate the strongest finding before commitment.";

  const biggestRisk = report.risks?.find((r) => r.level === "High")
    || report.risks?.[0]
    || { name: "Adoption risk", mitigation: "Validate with stakeholder interviews.", level: "Med" as const };

  const bestNextAction = report.nextSteps?.[0]
    || report.recommendations?.[0]
    || "Run a small pilot to validate the dominant assumption.";

  const decisionSummaryLine = report.decision
    ? `${report.decision.recommendationLabel}. ${report.decision.nextStepHint}`
    : report.executiveSummary || "AI-supported feasibility recommendation.";

  const internal = isInternalProject(report, inputs);

  const sourceById = new Map((report.sources ?? []).map((source) => [source.sourceId, source]));
  const evidenceItems = (report.claims ?? []).slice(0, 5).map((claim) => ({
    ...claim,
    supportingSources: claim.supportingSourceIds.flatMap((sourceId) => {
      const source = sourceById.get(sourceId);
      return source ? [source] : [];
    }),
    conflictingSources: claim.conflictingSourceIds.flatMap((sourceId) => {
      const source = sourceById.get(sourceId);
      return source ? [source] : [];
    }),
  }));
  const supportedClaimCount = report.claims?.filter((claim) => claim.supportStatus === "supported").length ?? 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-[12px] text-muted-foreground">
        <Link to={demo ? "/" : "/dashboard"} className="transition-colors hover:text-foreground">
          {demo ? "Concept AI" : "My Analyses"}
        </Link>
        <ChevronRight className="h-3.5 w-3.5 opacity-50" />
        {demo ? (
          <span className="truncate text-foreground/80">{title}</span>
        ) : (
          <Link to={`/reports/${reportId}`} className="truncate transition-colors hover:text-foreground">
            {title}
          </Link>
        )}
        <ChevronRight className="h-3.5 w-3.5 opacity-50" />
        <span className="text-foreground/80">Executive Decision Room</span>
      </nav>
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate(demo ? "/demo" : "/dashboard")} className="h-8 gap-1.5 text-muted-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> {demo ? "Back to demo" : "Back to dashboard"}
        </Button>
      </div>

      <div className="space-y-6">

        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Executive Decision Room · 90-Second Judge Mode</span>
              {demo && <Badge variant="outline" className="border-warning/40 text-warning">{report.demo?.label || "Illustrative Demo — Synthetic Data"}</Badge>}
            </div>
            <h1 className="mt-1 font-display text-2xl font-medium tracking-tight">{title}</h1>
            <p className="text-sm text-muted-foreground">A 90-second read of the AI-supported recommendation, evidence, and risk. Human approval remains separate.</p>
            {demo && <p className="mt-1 text-xs font-medium text-warning">{report.demo?.disclaimer || "Synthetic demonstration — not measured organizational results"}</p>}
          </div>
          {canEditStatus && (
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Human workflow status</div>
              <StatusControl
                report={{ id: reportId, status } as ReportRow}
                onChanged={(s) => setRow((prev) => (prev ? { ...prev, status: s } : prev))}
              />
            </div>
          )}
        </div>

        {/* Top Decision Card */}
        <Card className="border-primary/40 bg-card">
          <CardContent className="p-6">
            <div className="grid gap-6 md:grid-cols-[1.4fr_1fr]">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">AI-supported recommendation</div>
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  <Badge className={`px-3 py-1.5 text-sm font-bold ${verdictTone(report.scores.verdict)}`}>
                    {report.scores.verdict}
                  </Badge>
                  <span className="text-sm text-muted-foreground">for {inputs.projectName}</span>
                </div>
                <p className="mt-3 text-[15px] leading-relaxed text-foreground">{decisionSummaryLine}</p>
                <div className="mt-4 rounded-md border border-border bg-muted/30 p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Recommended next step</div>
                  <p className="mt-1 text-sm text-foreground">{bestNextAction}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 self-start">
                <div className="rounded-md border border-border bg-muted/30 p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Overall score</div>
                  <div className="mt-1 font-display text-3xl font-bold text-primary">{report.scores.overall.toFixed(1)}<span className="text-base text-muted-foreground">/10</span></div>
                </div>
                <div className="rounded-md border border-border bg-muted/30 p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground" title="A model-estimated indicator constrained by input completeness and evidence support; it is not statistical certainty.">Model-estimated confidence</div>
                  <div className="mt-1 font-display text-3xl font-bold text-foreground">{overallConf}</div>
                </div>
                <div className="col-span-2 rounded-md border border-border bg-muted/30 p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Business model</div>
                  <div className="mt-1 text-sm text-foreground">{inputs.businessModel || (internal ? "Internal platform" : "—")}</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Why This Decision */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card className="border-success/30">
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><CheckCircle2 className="h-4 w-4 text-success" /> Strongest supported reason</CardTitle></CardHeader>
            <CardContent><p className="text-sm leading-relaxed text-foreground">{strongestReason}</p></CardContent>
          </Card>
          <Card className="border-destructive/30">
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><ShieldAlert className="h-4 w-4 text-destructive" /> Biggest risk</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm font-medium text-foreground">{biggestRisk.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">Level: {biggestRisk.level}</p>
            </CardContent>
          </Card>
          <Card className="border-primary/30">
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Target className="h-4 w-4 text-primary" /> Best next action</CardTitle></CardHeader>
            <CardContent><p className="text-sm leading-relaxed text-foreground">{bestNextAction}</p></CardContent>
          </Card>
        </div>

        {/* FMART-O Decision Breakdown */}
        <Section title="FMART-O Decision Breakdown" icon={Gauge} hint="FMART-O 6-Dimension Weighted Scoring · per-dimension evidence & rationale">
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Dimension</th>
                  <th className="px-3 py-2 text-right">Score</th>
                  <th className="px-3 py-2 text-right">Model-estimated confidence</th>
                  <th className="px-3 py-2 text-right">Direct sources</th>
                  <th className="px-3 py-2 text-left">Why this score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {DIM_KEYS.map((k) => {
                  const score = report.scores[k];
                  const conf = formatConfidence(report.scores.confidence?.[k]);
                  const ev = dimensionEvidenceCount(report, k);
                  const rationale = report.scores.rationale?.[k] || report.scores[FINDING_KEYS[k]] || "—";
                  return (
                    <tr key={k}>
                      <td className="px-3 py-2 font-medium">{DIM_LABELS[k]}</td>
                      <td className="px-3 py-2 text-right font-mono text-primary">{score?.toFixed(1) ?? "—"}</td>
                      <td className="px-3 py-2 text-right font-mono">{conf}</td>
                      <td className="px-3 py-2 text-right font-mono text-muted-foreground">{ev}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{rationale}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>

        {/* Evidence Map */}
        <Section title="Evidence Map" icon={Sparkles} hint="Explicit claim-to-source links only; unsupported and inferred claims remain visible.">
          {evidenceItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">No claim-level evidence mapping was captured for this report.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {evidenceItems.map((claim) => (
                <div key={claim.claimId} className="rounded-md border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge variant="outline" className="text-[10px]">{claim.provenance}</Badge>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{claim.supportStatus.replace("_", " ")}</span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-foreground">{claim.claimText}</p>
                  {claim.supportingSources.length > 0 ? (
                    <div className="mt-2 space-y-1">
                      {claim.supportingSources.map((source) => (
                        <a key={source.sourceId} href={source.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline">
                          {source.title} <ExternalLink className="h-3 w-3" />
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-warning">{claim.provenance === "AI inference" ? "AI-estimated assumption — not externally verified" : "Unsupported — requires validation"}</p>
                  )}
                  {claim.conflictingSources.length > 0 && (
                    <p className="mt-2 text-xs text-destructive">Conflicting sources: {claim.conflictingSources.map((source) => source.title).join(", ")}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Risk-to-Mitigation Map */}
        <Section title="Risk → Mitigation Map" icon={ShieldAlert}>
          {report.risks?.length ? (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Risk</th>
                    <th className="px-3 py-2 text-left">Level</th>
                    <th className="px-3 py-2 text-left">Why it matters</th>
                    <th className="px-3 py-2 text-left">Mitigation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {report.risks.slice(0, 6).map((r, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 font-medium">{r.name}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className={
                          r.level === "High" ? "border-destructive/40 text-destructive"
                          : r.level === "Med" ? "border-warning/40 text-warning"
                          : "border-success/40 text-success"
                        }>{r.level}</Badge>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">Prob: {r.probability} · Impact: {r.impact}</td>
                      <td className="px-3 py-2 text-xs text-foreground">{r.mitigation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No risks were captured for this report.</p>
          )}
        </Section>

        {/* Judge Memo */}
        <Section title="Judge Memo" icon={MessageSquare} hint="One-pager generated from the existing report — no new AI call.">
          <div className="grid gap-4 md:grid-cols-2">
            {[
              ["Problem", inputs.description || inputs.strategicObjectives || "—"],
              ["Solution", inputs.strategicObjectives || inputs.description || "—"],
              ["Evidence", report.research?.overview || `${supportedClaimCount} directly supported claim${supportedClaimCount === 1 ? "" : "s"}.`],
              ["Business impact", internal ? `Internal value: ${report.financials.investmentRange} · break-even ${report.financials.breakEvenSummary}` : `Investment ${report.financials.investmentRange} · break-even ${report.financials.breakEvenSummary} · ${report.market.tamValue} TAM`],
              ["Current limitation", biggestRisk.name],
              ["Next step", bestNextAction],
            ].map(([label, value]) => (
              <div key={label} className="rounded-md border border-border bg-muted/20 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
                <p className="mt-1 text-sm leading-relaxed text-foreground">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {!demo && reportId && (
              <Button variant="outline" size="sm" onClick={() => navigate(`/reports/${reportId}`)} className="gap-1.5">
                Open full dashboard <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => navigate(demo ? "/demo" : "/dashboard")} className="gap-1.5">
              <ArrowLeft className="h-3.5 w-3.5" /> {demo ? "Back to demo" : "Back to dashboard"}
            </Button>
          </div>
        </Section>

        {/* Consumer Evidence & Improvement Layer */}
        <EvidenceSections report={report} reportId={demo ? undefined : reportId} canEdit={canEditStatus} />
      </div>
    </div>
  );
};

export default DecisionRoom;
