import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft, CheckCircle2, ChevronRight, ExternalLink,
  Gauge, Loader2, MessageSquare, ShieldAlert, Sparkles, Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getReportById, type ReportRow } from "@/lib/reports";
import { formatConfidence, confidencePercent, isInternalProject } from "@/lib/format";
import { demoReport, demoInputs, DEMO_REPORT_ID } from "@/data/demoReport";
import type { FeasibilityReport, ConceptInputs, ResearchCitation } from "@/types/analysis";
import { toast } from "sonner";
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

const dimensionEvidenceCount = (citations: ResearchCitation[] | undefined, dim: string) => {
  if (!citations?.length) return 0;
  const needle = dim.toLowerCase();
  return citations.filter((c) =>
    `${c.title} ${c.takeaway} ${c.source}`.toLowerCase().includes(needle),
  ).length;
};

const Section = ({ title, icon: Icon, children, hint }: any) => (
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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    (async () => {
      try {
        if (reportId === DEMO_REPORT_ID) {
          if (!cancelled) setRow({ inputs: demoInputs, output: demoReport, title: demoInputs.projectName, slug: null, demo: true, ownerId: null, status: "draft" });
          return;
        }
        const r: ReportRow | null = await getReportById(reportId);
        if (!r) { if (!cancelled) setNotFound(true); return; }
        if (!cancelled) setRow({ inputs: r.inputs, output: r.output, title: r.title, slug: r.slug, demo: false, ownerId: r.user_id, status: r.status });
      } catch (e: any) {
        toast.error(e?.message || "Could not load report");
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [reportId]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
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

  const strongestReason = report.recommendations?.[0]
    || report.scores.financialFinding
    || "Strong overall feasibility based on weighted scoring.";

  const biggestRisk = report.risks?.find((r) => r.level === "High")
    || report.risks?.[0]
    || { name: "Adoption risk", mitigation: "Validate with stakeholder interviews.", level: "Med" as const };

  const bestNextAction = report.nextSteps?.[0]
    || report.recommendations?.[0]
    || "Run a small pilot to validate the dominant assumption.";

  const decisionSummaryLine =
    (report.executiveSummary || "").split(/[.!?]\s/)[0]?.slice(0, 240) || "AI-generated feasibility decision.";

  const internal = isInternalProject(report, inputs);

  const evidenceItems = (report.research?.citations || []).slice(0, 5);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")} className="h-8 gap-1.5 text-muted-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to dashboard
        </Button>
      </div>

      <div className="space-y-6">

        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Decision Room · Judge Mode</span>
              {demo && <Badge variant="outline" className="border-warning/40 text-warning">Demo data</Badge>}
            </div>
            <h1 className="mt-1 font-display text-2xl font-medium tracking-tight">{title}</h1>
            <p className="text-sm text-muted-foreground">A 90-second read of the AI's decision, evidence, and risk.</p>
          </div>
          {canEditStatus && (
            <StatusControl
              report={{ id: reportId, status } as ReportRow}
              onChanged={(s) => setRow((prev) => (prev ? { ...prev, status: s } : prev))}
            />
          )}
        </div>

        {/* Top Decision Card */}
        <Card className="border-primary/40 bg-card">
          <CardContent className="p-6">
            <div className="grid gap-6 md:grid-cols-[1.4fr_1fr]">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Final decision</div>
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  <Badge className={`px-3 py-1.5 text-sm font-bold ${verdictTone(report.scores.verdict)}`}>
                    {report.scores.verdict}
                  </Badge>
                  <span className="text-sm text-muted-foreground">for {inputs.projectName}</span>
                </div>
                <p className="mt-3 text-[15px] leading-relaxed text-foreground">{decisionSummaryLine}.</p>
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
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Confidence</div>
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
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><CheckCircle2 className="h-4 w-4 text-success" /> Strongest reason to proceed</CardTitle></CardHeader>
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
                  <th className="px-3 py-2 text-right">Confidence</th>
                  <th className="px-3 py-2 text-right">Evidence</th>
                  <th className="px-3 py-2 text-left">Why this score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {DIM_KEYS.map((k) => {
                  const score = (report.scores as any)[k] as number;
                  const conf = formatConfidence(report.scores.confidence?.[k]);
                  const ev = dimensionEvidenceCount(report.research?.citations, k);
                  const rationale = report.scores.rationale?.[k] || (report.scores as any)[`${k}Finding`] || "—";
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
        <Section title="Evidence Map" icon={Sparkles} hint="Top sources the AI grounded its decision in.">
          {evidenceItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">No public research citations were captured for this report.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {evidenceItems.map((c, i) => {
                const body = (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{c.source || "Source"}</span>
                      {c.url && <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                    </div>
                    <div className="mt-1 line-clamp-2 text-sm font-medium text-foreground">{c.title || "Untitled source"}</div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{c.takeaway || "—"}</p>
                  </>
                );
                return c.url ? (
                  <a key={i} href={c.url} target="_blank" rel="noreferrer" className="rounded-md border border-border p-3 transition-colors hover:bg-accent">
                    {body}
                  </a>
                ) : (
                  <div key={i} className="rounded-md border border-border p-3">{body}</div>
                );
              })}
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
              ["Evidence", report.research?.overview || `${report.research?.citations?.length ?? 0} grounded sources used.`],
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
            <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")} className="gap-1.5">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to dashboard
            </Button>
          </div>
        </Section>

        {/* Consumer Evidence & Improvement Layer */}
        <EvidenceSections report={report} reportId={demo ? undefined : reportId} canEdit={!demo} />
      </div>
    </div>
  );
};

export default DecisionRoom;
