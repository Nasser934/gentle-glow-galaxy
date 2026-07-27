// Global top indicator for background analyses (elapsed time + live stage).
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  type AnalysisJob,
  STAGE_LABEL,
  formatElapsed,
  listActiveAnalysisJobs,
} from "@/lib/analysisJobs";

export const AnalysisJobsIndicator = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const userId = user?.id;
  const [jobs, setJobs] = useState<AnalysisJob[]>([]);
  const [, forceTick] = useState(0);
  const seenDone = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!userId) { setJobs([]); return; }
    try { setJobs(await listActiveAnalysisJobs(userId)); } catch { /* ignore */ }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  // Live updates
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`analysis-jobs:${userId}:${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "analysis_jobs", filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as AnalysisJob | undefined;
          if (row && (row.status === "completed" || row.status === "failed") && !seenDone.current.has(row.id)) {
            seenDone.current.add(row.id);
            if (row.status === "completed" && row.report_id) {
              toast.success(`${row.title} is ready`, {
                description: `Completed in ${formatElapsed(row.started_at, row.completed_at)}.`,
                duration: 12000,
                action: { label: "Open report", onClick: () => navigate(`/reports/${row.report_id}`) },
              });
            } else if (row.status === "failed") {
              toast.error(`${row.title} could not be completed`, { description: row.error ?? undefined });
            }
          }
          load();
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [userId, load, navigate]);

  // Elapsed-time ticker + safety poll while jobs are running.
  useEffect(() => {
    if (jobs.length === 0) return;
    const tick = setInterval(() => forceTick((n) => n + 1), 1000);
    const poll = setInterval(load, 15000);
    return () => { clearInterval(tick); clearInterval(poll); };
  }, [jobs.length, load]);

  if (!userId || jobs.length === 0) return null;

  const primary = jobs[0];
  return (
    <div className="border-b border-border bg-primary/5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 lg:px-8">
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
        <span className="truncate text-[13px] font-medium text-foreground">{primary.title}</span>
        <span className="text-[12px] text-muted-foreground">
          {STAGE_LABEL[primary.stage] ?? primary.stage} · {formatElapsed(primary.started_at)}
        </span>
        {jobs.length > 1 && (
          <span className="text-[12px] text-muted-foreground">+{jobs.length - 1} more</span>
        )}
        <button
          onClick={() => navigate(`/analysis/${primary.id}`)}
          className="ml-auto inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline"
        >
          View progress <ArrowRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
};

export default AnalysisJobsIndicator;
