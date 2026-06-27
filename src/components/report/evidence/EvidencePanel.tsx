import { useNavigate } from "react-router-dom";
import {
  AlertCircle, ArrowUpRight, CheckCircle2, ChevronRight, Edit3,
  FileWarning, Gauge, History, Info, ShieldAlert, Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  ConceptInputs, FeasibilityReport, InputFieldAssessment,
  InputStatus, ReportVersion,
} from "@/types/analysis";

/* -------- shared styling helpers -------- */
const STATUS_TONE: Record<InputStatus, string> = {
  complete: "border-success/30 bg-success/10 text-success",
  needs_improvement: "border-warning/40 bg-warning/10 text-warning",
  weak: "border-warning/40 bg-warning/10 text-warning",
  missing: "border-destructive/40 bg-destructive/10 text-destructive",
};
const STATUS_LABEL: Record<InputStatus, string> = {
  complete: "Strong input", needs_improvement: "Needs detail",
  weak: "Needs detail", missing: "Missing",
};
const confidenceTone = (c: "High" | "Medium" | "Low") =>
  c === "High" ? "border-success/40 text-success"
  : c === "Medium" ? "border-warning/40 text-warning"
  : "border-destructive/40 text-destructive";

const verdictTone = (v: string) =>
  v === "PROCEED" ? "bg-success text-success-foreground"
  : v.startsWith("CONDITIONAL") ? "bg-warning text-warning-foreground"
  : v === "IMPROVE INPUTS BEFORE INVESTMENT DECISION" ? "bg-warning text-warning-foreground"
  : v === "REVISE" ? "bg-warning text-warning-foreground"
  : "bg-destructive text-destructive-foreground";

/* -------- Verdict / Decision header -------- */
export const DecisionHeader = ({ report }: { report: FeasibilityReport }) => {
  if (!report.decision) return null;
  const d = report.decision;
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Recommendation
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge className={`px-3 py-1 text-sm font-semibold ${verdictTone(d.verdict)}`}>
                {d.verdict}
              </Badge>
              <span className="text-xs text-muted-foreground">
                Score {report.scores.overall.toFixed(1)}/10 · Confidence {d.overallConfidencePct}%
              </span>
            </div>
            <p className="mt-3 text-sm text-foreground">
              <strong className="text-foreground">Next step:</strong>{" "}
              <span className="text-muted-foreground">{d.nextStepHint}</span>
            </p>
            {d.blockers.length > 0 && (
              <ul className="mt-3 space-y-1.5 text-xs text-foreground">
                {d.blockers.map((b, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

/* -------- Why this score? -------- */
export const WhyThisScore = ({ report }: { report: FeasibilityReport }) => {
  const rows = report.scoreExplanation || [];
  if (!rows.length) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Gauge className="h-4 w-4 text-primary" /> Why this score?
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Per-dimension drivers, missing evidence, and how to strengthen each score.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((row) => (
            <div key={row.dimension} className="rounded-md border border-border bg-muted/20 p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">{row.label}</div>
                <div className="font-mono text-sm text-primary">{row.score?.toFixed(1)}/10</div>
              </div>
              <div className="mt-2 space-y-2 text-xs leading-relaxed">
                <Block icon={CheckCircle2} tone="success" title="What helped">
                  {row.positiveDrivers.map((d, i) => <li key={i}>{d}</li>)}
                </Block>
                <Block icon={AlertCircle} tone="warning" title="What lowered the score">
                  {row.negativeDrivers.map((d, i) => <li key={i}>{d}</li>)}
                </Block>
                <Block icon={Sparkles} tone="primary" title="How to improve">
                  {row.improvementActions.map((d, i) => <li key={i}>{d}</li>)}
                </Block>
                <div className="mt-2 rounded border border-border bg-background/60 px-2 py-1.5 text-[11px] text-muted-foreground">
                  <strong className="text-foreground">Decision implication: </strong>{row.decisionImplication}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

const Block = ({ icon: Icon, tone, title, children }: any) => (
  <div>
    <div className={`flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider ${
      tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-primary"
    }`}>
      <Icon className="h-3 w-3" /> {title}
    </div>
    <ul className="mt-1 space-y-0.5 pl-4 text-foreground/90" style={{ listStyle: "disc" }}>
      {children}
    </ul>
  </div>
);

/* -------- Input Quality -------- */
export const InputQualityPanel = ({
  report, reportId, canEdit,
}: {
  report: FeasibilityReport;
  reportId?: string;
  canEdit?: boolean;
}) => {
  const navigate = useNavigate();
  const overall = report.inputQualityScore ?? 0;
  const overallStatus: InputStatus = overall >= 80 ? "complete" : overall >= 60 ? "needs_improvement" : overall >= 30 ? "weak" : "missing";
  const fields: InputFieldAssessment[] = (report as any)._inputFields || [];
  const problemFields = fields.filter((f) => f.status !== "complete");
  const contradictions = report.inputCompleteness?.contradictoryFields || [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileWarning className="h-4 w-4 text-primary" /> Input quality
        </CardTitle>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={STATUS_TONE[overallStatus]}>
            {STATUS_LABEL[overallStatus]} · {overall}%
          </Badge>
          <span className="text-xs text-muted-foreground">
            Stronger inputs raise confidence — they don't automatically raise the score.
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {problemFields.length === 0 ? (
          <div className="rounded border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
            All key input fields are complete.
          </div>
        ) : (
          <div className="space-y-2">
            {problemFields.map((f) => (
              <div key={String(f.key)} className="rounded-md border border-border bg-muted/20 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground">{f.label}</div>
                    <p className="mt-1 break-words text-[11px] leading-relaxed text-muted-foreground">
                      <strong className="text-foreground">Impact:</strong> {f.impact || "Needs validation."}
                    </p>
                    <p className="mt-1 break-words text-[11px] leading-relaxed text-muted-foreground">
                      <strong className="text-foreground">Suggestion:</strong> {f.suggestion || "Needs validation."}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <Badge variant="outline" className={STATUS_TONE[f.status]}>{STATUS_LABEL[f.status]}</Badge>
                    {canEdit && reportId && (
                      <Button
                        size="sm" variant="outline"
                        onClick={() => navigate(`/analyze?reportId=${reportId}&field=${String(f.key)}`)}
                        className="h-7 gap-1 px-2 text-[11px]"
                      >
                        <Edit3 className="h-3 w-3" /> Edit field
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {contradictions.length > 0 && (
          <div className="mt-3 rounded border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
            <strong>Potential contradictions:</strong> {contradictions.join(" ")}
          </div>
        )}

        {canEdit && reportId && problemFields.length > 0 && (
          <div className="mt-4 flex justify-end">
            <Button size="sm" onClick={() => navigate(`/analyze?reportId=${reportId}`)} className="gap-1.5">
              <Edit3 className="h-3.5 w-3.5" /> Improve report inputs
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

/* -------- Evidence Mix -------- */
export const EvidenceMixPanel = ({ report }: { report: FeasibilityReport }) => {
  const mix = report.evidenceMix;
  if (!mix) return null;
  const aiHeavy = mix.aiAssumptionPercent > 40;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Info className="h-4 w-4 text-primary" /> Evidence mix
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Where the analysis got its information.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <Bar label="From your inputs" pct={mix.userInputPercent} tone="primary" />
        <Bar label="From web research" pct={mix.webResearchPercent} tone="success" />
        <Bar label="AI assumptions" pct={mix.aiAssumptionPercent} tone={aiHeavy ? "warning" : "muted"} />
        {aiHeavy && (
          <div className="rounded border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
            Some parts of this report rely on assumptions because input data or public evidence is incomplete. Add more project details to improve confidence.
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const Bar = ({ label, pct, tone }: { label: string; pct: number; tone: "primary" | "success" | "warning" | "muted" }) => (
  <div>
    <div className="flex items-center justify-between text-xs">
      <span className="font-medium text-foreground">{label}</span>
      <span className="font-mono text-muted-foreground">{pct}%</span>
    </div>
    <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
      <div
        className={`h-full rounded-full ${
          tone === "primary" ? "bg-primary"
          : tone === "success" ? "bg-success"
          : tone === "warning" ? "bg-warning"
          : "bg-muted-foreground/50"
        }`}
        style={{ width: `${Math.max(2, pct)}%` }}
      />
    </div>
  </div>
);

/* -------- Claim Evidence Table -------- */
export const ClaimEvidenceTable = ({ report }: { report: FeasibilityReport }) => {
  const rows = report.claimEvidenceMap || [];
  if (!rows.length) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" /> Evidence behind this report
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          For each major claim — how much came from you, from the web, and from AI inference.
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Claim</th>
                <th className="px-3 py-2 text-left">Section</th>
                <th className="px-3 py-2 text-right">You</th>
                <th className="px-3 py-2 text-right">Web</th>
                <th className="px-3 py-2 text-right">AI</th>
                <th className="px-3 py-2 text-left">Confidence</th>
                <th className="px-3 py-2 text-left">How to strengthen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.claimId}>
                  <td className="px-3 py-2 font-medium text-foreground">{r.claimText}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{r.reportSection}</td>
                  <td className="px-3 py-2 text-right font-mono">{r.userInputPercent}%</td>
                  <td className="px-3 py-2 text-right font-mono">{r.webResearchPercent}%</td>
                  <td className={`px-3 py-2 text-right font-mono ${r.aiAssumptionPercent > 40 ? "text-warning" : ""}`}>
                    {r.aiAssumptionPercent}%
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className={confidenceTone(r.confidence)}>{r.confidence}</Badge>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{r.userCanImproveBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
};

/* -------- Version Comparison -------- */
export const VersionComparison = ({ report }: { report: FeasibilityReport }) => {
  const versions: ReportVersion[] = report.reportVersions || [];
  if (!versions.length) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4 text-primary" /> Version history
        </CardTitle>
        <p className="text-xs text-muted-foreground">How the analysis evolved as inputs changed.</p>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {versions.slice().reverse().map((v) => (
            <div key={v.versionId} className="rounded-md border border-border bg-muted/20 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground">{new Date(v.createdAt).toLocaleString()}</div>
                <div className="flex items-center gap-2 text-xs">
                  <Delta label="Score" prev={v.previousScore} next={v.newScore} fmt={(n) => n.toFixed(1)} />
                  <Delta label="Confidence" prev={v.previousConfidence} next={v.newConfidence} fmt={(n) => `${Math.round(n)}%`} />
                  <Delta label="AI assumptions" prev={v.previousAiAssumptionPercent} next={v.newAiAssumptionPercent} fmt={(n) => `${Math.round(n)}%`} invert />
                </div>
              </div>
              <p className="mt-2 text-foreground">{v.summary}</p>
              {v.changedInputs.length > 0 && (
                <div className="mt-1 text-xs text-muted-foreground">
                  Changed fields: {v.changedInputs.join(", ")}
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

const Delta = ({ label, prev, next, fmt, invert }: { label: string; prev: number; next: number; fmt: (n: number) => string; invert?: boolean }) => {
  const diff = next - prev;
  const good = invert ? diff < 0 : diff > 0;
  const bad = invert ? diff > 0 : diff < 0;
  return (
    <span className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-0.5">
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-mono">{fmt(prev)} → {fmt(next)}</span>
      {diff !== 0 && (
        <span className={good ? "text-success" : bad ? "text-destructive" : "text-muted-foreground"}>
          ({diff > 0 ? "+" : ""}{fmt(diff)})
        </span>
      )}
    </span>
  );
};

/* -------- Legacy notice -------- */
export const LegacyEvidenceNotice = ({ report, reportId, canEdit }: { report: FeasibilityReport; reportId?: string; canEdit?: boolean }) => {
  const navigate = useNavigate();
  if (!report.legacyEvidence) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
      <span>
        Evidence detail is estimated for this report. Re-run analysis to calculate full input quality and evidence mix.
      </span>
      {canEdit && reportId && (
        <Button size="sm" variant="outline" onClick={() => navigate(`/analyze?reportId=${reportId}`)} className="gap-1.5">
          Re-run analysis <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
};

/* -------- All-in-one render -------- */
export const EvidenceSections = ({
  report, reportId, canEdit,
}: {
  report: FeasibilityReport;
  reportId?: string;
  canEdit?: boolean;
}) => (
  <div className="space-y-6">
    <LegacyEvidenceNotice report={report} reportId={reportId} canEdit={canEdit} />
    <DecisionHeader report={report} />
    <WhyThisScore report={report} />
    <div className="grid gap-6 lg:grid-cols-2">
      <InputQualityPanel report={report} reportId={reportId} canEdit={canEdit} />
      <EvidenceMixPanel report={report} />
    </div>
    <ClaimEvidenceTable report={report} />
    <VersionComparison report={report} />
  </div>
);
