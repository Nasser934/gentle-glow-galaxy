// Durable analysis worker. Pulls one job message off the pgmq queue and runs a
// single stage so every invocation stays well inside Edge Function limits.
// Stages: queued -> researching -> generating -> validating -> saving -> completed
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { ensureEvidenceFields, deepSanitize } from "../_shared/evidence.ts";
import { kimiStructured, KimiError } from "../_shared/kimi.ts";
import { fetchPublicResearch, reportSchema, buildPrompts, buildBaseReport } from "../_shared/analysisCore.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-worker-secret",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const MAX_ATTEMPTS = 3;

const admin = () =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function selfKick(secret: string) {
  fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/analysis-worker`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-worker-secret": secret },
    body: "{}",
  }).catch(() => {});
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const db = admin();
  const { data: cfg } = await db.from("job_worker_config").select("worker_secret").maybeSingle();
  const secret = cfg?.worker_secret ?? "";
  const provided = req.headers.get("x-worker-secret") ?? "";
  if (!secret || provided !== secret) return json({ error: "Forbidden" }, 403);

  // Claim one queued message (visibility timeout hides it from other workers).
  const { data: msgs, error: readErr } = await db.rpc("read_analysis_job_queue", { p_vt: 240, p_qty: 1 });
  if (readErr) {
    console.error("queue read failed", readErr.message);
    return json({ error: "queue_read_failed" }, 500);
  }
  const msg = Array.isArray(msgs) ? msgs[0] : null;
  if (!msg) return json({ idle: true });

  const msgId = msg.msg_id as number;
  const jobId = msg.job_id as string;

  const { data: job } = await db.from("analysis_jobs").select("*").eq("id", jobId).maybeSingle();
  if (!job || job.status === "completed" || job.status === "failed") {
    await db.rpc("delete_analysis_job_msg", { p_msg_id: msgId });
    await selfKick(secret);
    return json({ skipped: true });
  }

  const setStage = async (patch: Record<string, unknown>) => {
    await db.from("analysis_jobs").update(patch).eq("id", jobId);
  };

  try {
    const inputs = (job.inputs ?? {}) as Record<string, string>;

    if (job.status === "queued") {
      await setStage({ status: "researching", stage: "researching" });
      const research = await fetchPublicResearch(inputs);
      await setStage({ research, status: "generating", stage: "generating" });
    } else if (job.status === "researching") {
      // Retry of a partially-run research stage.
      const research = await fetchPublicResearch(inputs);
      await setStage({ research, status: "generating", stage: "generating" });
    } else if (job.status === "generating") {
      const research = job.research ?? (await fetchPublicResearch(inputs));
      const { systemPrompt, userPrompt } = buildPrompts(inputs, research);
      const parsed = await kimiStructured(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        "provide_report",
        "Provide the full feasibility report.",
        reportSchema as Record<string, unknown>,
      );
      if (!parsed || typeof parsed !== "object" || !parsed.scores || !parsed.financials) {
        throw new KimiError(502, "AI did not return a structured report.");
      }
      const draft = buildBaseReport(parsed, research);
      await setStage({ research, draft, status: "validating", stage: "validating" });
    } else if (job.status === "validating") {
      const enriched = ensureEvidenceFields(job.draft, inputs);
      const report = deepSanitize(enriched);
      await setStage({ draft: report, status: "saving", stage: "saving" });
    } else if (job.status === "saving") {
      let reportId = job.report_id as string | null;
      if (!reportId) {
        const { data: saved, error: saveErr } = await db
          .from("reports")
          .insert({
            user_id: job.user_id,
            title: inputs.projectName || "Untitled analysis",
            industry: inputs.industry || null,
            inputs,
            output: job.draft,
          })
          .select("id, slug")
          .single();
        if (saveErr || !saved) throw new Error(saveErr?.message || "Could not save the report.");
        reportId = saved.id;
      }
      const completedAt = new Date();
      const seconds = Math.max(1, Math.round((completedAt.getTime() - new Date(job.started_at).getTime()) / 1000));
      const mins = Math.floor(seconds / 60);
      const duration = mins > 0 ? `${mins}m ${seconds % 60}s` : `${seconds}s`;

      await setStage({
        report_id: reportId,
        status: "completed",
        stage: "completed",
        completed_at: completedAt.toISOString(),
        error: null,
      });

      await db.from("notifications").insert({
        user_id: job.user_id,
        report_id: reportId,
        kind: "analysis",
        title: `${job.title} analysis is ready`,
        body: `Completed in ${duration}.`,
        url: `/reports/${reportId}`,
      });
    }

    await db.rpc("delete_analysis_job_msg", { p_msg_id: msgId });

    const { data: after } = await db.from("analysis_jobs").select("status").eq("id", jobId).maybeSingle();
    if (after && after.status !== "completed" && after.status !== "failed") {
      await db.rpc("enqueue_analysis_job", { p_job_id: jobId, p_delay: 0 });
    }
    await selfKick(secret);
    return json({ ok: true, jobId, stage: after?.status });
  } catch (e) {
    const attempts = (job.attempts ?? 0) + 1;
    const message = e instanceof KimiError ? e.message : "Analysis failed. Please try again.";
    console.error("analysis-worker error", jobId, job.status, e);
    await db.rpc("delete_analysis_job_msg", { p_msg_id: msgId });

    if (attempts >= MAX_ATTEMPTS) {
      await setStage({
        attempts,
        status: "failed",
        stage: "failed",
        error: message,
        completed_at: new Date().toISOString(),
      });
      await db.from("notifications").insert({
        user_id: job.user_id,
        kind: "analysis",
        title: `${job.title} analysis could not be completed`,
        body: message,
        url: `/analysis/${jobId}`,
      });
      return json({ failed: true, jobId });
    }

    await setStage({ attempts, error: message });
    await db.rpc("enqueue_analysis_job", { p_job_id: jobId, p_delay: 5 });
    await selfKick(secret);
    return json({ retry: true, attempts, jobId });
  }
});
