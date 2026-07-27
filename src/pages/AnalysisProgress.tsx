// Live progress page for a background analysis job.
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, Loader2, AlertCircle, Circle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import {
  type AnalysisJob,
  type JobStage,
  STAGE_LABEL,
  STAGE_ORDER,
  formatElapsed,
  getAnalysisActivityLabel,
  getAnalysisJob,
  isActiveStage,
} from "@/lib/analysisJobs";

const AnalysisProgress = () => {
  const { jobId = "" } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState<AnalysisJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [, tick] = useState(0);

  const load = useCallback(async () => {
    try { setJob(await getAnalysisJob(jobId)); } catch { /* ignore */ }
    setLoading(false);
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!jobId) return;
    const channel = supabase
      .channel(`analysis-job:${jobId}:${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "analysis_jobs", filter: `id=eq.${jobId}` },
        () => load(),
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [jobId, load]);

  useEffect(() => {
    if (!job || !isActiveStage(job.stage)) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    const p = setInterval(load, 10000);
    return () => { clearInterval(t); clearInterval(p); };
  }, [job, load]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading analysis…
      </div>
    );
  }

  if (!job) {
    return (
      <Card className="mx-auto max-w-lg p-6 text-sm">
        <p className="font-medium text-foreground">Analysis not found</p>
        <p className="mt-1 text-muted-foreground">It may have been removed, or belongs to another account.</p>
        <Button className="mt-4" size="sm" onClick={() => navigate("/dashboard")}>Back to My Analyses</Button>
      </Card>
    );
  }

  const currentIndex = STAGE_ORDER.indexOf(job.stage as JobStage);
  const failed = job.status === "failed";
  const done = job.status === "completed";

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">{job.title}</h1>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {failed ? "Analysis failed" : done ? "Analysis complete" : "Analysis in progress — you can keep using the app"}
            </p>
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Elapsed</div>
            <div className="font-mono text-base font-semibold text-foreground">
              {formatElapsed(job.started_at, job.completed_at)}
            </div>
          </div>
        </div>

        <ol className="mt-5 space-y-2.5">
          {STAGE_ORDER.map((stage, i) => {
            const complete = done || i < currentIndex;
            const active = !done && !failed && i === currentIndex;
            return (
              <li key={stage} className="flex items-center gap-2.5 text-[13px]">
                {complete ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                ) : active ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                ) : (
                  <Circle className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                )}
                <span className={complete || active ? "text-foreground" : "text-muted-foreground"}>
                  {STAGE_LABEL[stage]}
                </span>
              </li>
            );
          })}
        </ol>

        {!done && !failed && job.stage_detail && (
          <p className="mt-3 text-[12px] text-muted-foreground">
            {getAnalysisActivityLabel(job)}
          </p>
        )}



        {failed && (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-[13px]">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div>
              <p className="font-medium text-foreground">{job.error || "Analysis failed. Please try again."}</p>
              <Button size="sm" className="mt-3" onClick={() => navigate("/analyze")}>Start a new analysis</Button>
            </div>
          </div>
        )}

        {done && job.report_id && (
          <Button className="mt-5 gap-1.5" onClick={() => navigate(`/reports/${job.report_id}`)}>
            Open report <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </Card>

      {!done && !failed && (
        <p className="text-center text-[12px] text-muted-foreground">
          You can navigate away — we'll notify you the moment it's ready.
        </p>
      )}
    </div>
  );
};

export default AnalysisProgress;
