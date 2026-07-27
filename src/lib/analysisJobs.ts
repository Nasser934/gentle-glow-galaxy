import { supabase } from "@/integrations/supabase/client";
import type { ConceptInputs } from "@/types/analysis";

export type JobStage =
  | "queued"
  | "researching"
  | "generating"
  | "validating"
  | "saving"
  | "completed"
  | "failed";

export interface AnalysisJob {
  id: string;
  user_id: string;
  title: string;
  status: JobStage;
  stage: JobStage;
  report_id: string | null;
  error: string | null;
  started_at: string;
  completed_at: string | null;
}

export const STAGE_LABEL: Record<JobStage, string> = {
  queued: "Queued",
  researching: "Researching the market",
  generating: "Generating the report",
  validating: "Validating results",
  saving: "Saving your report",
  completed: "Completed",
  failed: "Failed",
};

export const STAGE_ORDER: JobStage[] = ["queued", "researching", "generating", "validating", "saving", "completed"];

export const isActiveStage = (s: JobStage) => s !== "completed" && s !== "failed";

const JOB_COLUMNS = "id, user_id, title, status, stage, report_id, error, started_at, completed_at";

/** Kick off a durable background analysis. Returns immediately with the job id. */
export async function startAnalysisJob(inputs: ConceptInputs): Promise<string> {
  const { data, error } = await supabase.functions.invoke("start-analysis", { body: { inputs } });
  if (error) {
    let detail = error.message;
    try {
      const ctx: any = (error as any).context;
      if (ctx?.json) { const j = await ctx.json(); if (j?.error) detail = j.error; }
      else if (ctx?.text) { const t = await ctx.text(); if (t) detail = t; }
    } catch (_) { /* ignore */ }
    throw new Error(detail);
  }
  if (data?.error) throw new Error(data.error);
  if (!data?.jobId) throw new Error("Could not start the analysis. Please try again.");
  return data.jobId as string;
}

export async function getAnalysisJob(id: string): Promise<AnalysisJob | null> {
  const { data, error } = await supabase
    .from("analysis_jobs")
    .select(JOB_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown) as AnalysisJob | null;
}

export async function listActiveAnalysisJobs(userId: string): Promise<AnalysisJob[]> {
  const { data, error } = await supabase
    .from("analysis_jobs")
    .select(JOB_COLUMNS)
    .eq("user_id", userId)
    .not("status", "in", '("completed","failed")')
    .order("started_at", { ascending: false })
    .limit(10);
  if (error) throw error;
  return ((data ?? []) as unknown) as AnalysisJob[];
}

/** Human elapsed time from a saved ISO timestamp (survives refresh/navigation). */
export function formatElapsed(startedAt: string, endedAt?: string | null): string {
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  const secs = Math.max(0, Math.floor((end - start) / 1000));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
}
