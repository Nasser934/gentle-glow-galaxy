// Enqueue a durable analysis job. Returns immediately — processing happens in
// the `analysis-worker` function, driven by a Supabase (pgmq) queue.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sanitizeInputs } from "../_shared/analysisCore.ts";
import { KIMI_MODEL } from "../_shared/kimi.ts";
import {
  CONCEPT_AI_POLICY_VERSION,
  PROMPT_BUNDLE_HASH,
  PROMPT_BUNDLE_VERSION,
} from "../_shared/ai/promptManifest.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Please sign in to run an analysis." }, 401);
    const token = authHeader.replace("Bearer ", "");

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    let userId: string | undefined;
    try {
      const { data } = await supabaseAuth.auth.getClaims(token);
      userId = data?.claims?.sub as string | undefined;
    } catch (_) { /* ignore */ }
    if (!userId) {
      const { data, error } = await supabaseAuth.auth.getUser(token);
      if (error || !data?.user?.id) return json({ error: "Your session has expired. Please sign in again." }, 401);
      userId = data.user.id;
    }

    const body = await req.json().catch(() => ({}));
    const sanitized = sanitizeInputs(body?.inputs ?? {});
    if (!sanitized.ok) return json({ error: sanitized.error }, 413);
    const inputs = sanitized.inputs;
    if (!inputs.projectName || !inputs.industry || !inputs.description) {
      return json({ error: "Missing required project fields" }, 400);
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Optional re-run: the new analysis becomes a child version of the parent report.
    const rawParentId = typeof body?.parentReportId === "string" ? body.parentReportId.trim() : "";
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let parentReportId: string | null = null;
    let rootReportId: string | null = null;
    let previousInputs: unknown = null;
    let previousOutput: unknown = null;
    if (rawParentId) {
      if (!uuidRe.test(rawParentId)) return json({ error: "Invalid report reference." }, 400);
      const { data: parent } = await admin
        .from("reports")
        .select("id, user_id, root_report_id, parent_report_id, inputs, output")
        .eq("id", rawParentId)
        .maybeSingle();
      if (!parent) return json({ error: "Original report not found." }, 404);
      if (parent.user_id !== userId) {
        return json({ error: "Only the report owner can create a new version." }, 403);
      }
      rootReportId = (parent.root_report_id as string | null) ?? parent.id;
      parentReportId = parent.id;
      previousInputs = parent.inputs;
      previousOutput = parent.output;
    }

    // Duplicate guard: reuse an in-flight job with the same title and parent.
    let dupQuery = admin
      .from("analysis_jobs")
      .select("id, status, started_at")
      .eq("user_id", userId)
      .eq("title", inputs.projectName)
      .not("status", "in", '("completed","failed")')
      .gte("started_at", new Date(Date.now() - 30 * 60_000).toISOString());
    dupQuery = parentReportId
      ? dupQuery.eq("parent_report_id", parentReportId)
      : dupQuery.is("parent_report_id", null);
    const { data: existing } = await dupQuery.maybeSingle();
    if (existing?.id) return json({ jobId: existing.id, reused: true });

    const { data: job, error: insertErr } = await admin
      .from("analysis_jobs")
      .insert({
        user_id: userId,
        title: inputs.projectName,
        inputs,
        status: "queued",
        stage: "queued",
        parent_report_id: parentReportId,
        root_report_id: rootReportId,
        previous_inputs: previousInputs,
        previous_output: previousOutput,
        policy_version: CONCEPT_AI_POLICY_VERSION,
        prompt_version: PROMPT_BUNDLE_VERSION,
        prompt_hash: PROMPT_BUNDLE_HASH,
        model_id: KIMI_MODEL,
        started_at: new Date().toISOString(),
      })
      .select("id, started_at")
      .single();
    if (insertErr || !job) {
      console.error("job insert failed", insertErr?.message);
      return json({ error: "Could not start the analysis. Please try again." }, 500);
    }

    await admin.rpc("enqueue_analysis_job", { p_job_id: job.id, p_delay: 0 });

    // Fire-and-forget kick so processing starts right away.
    const secret = await admin.from("job_worker_config").select("worker_secret").maybeSingle();
    fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/analysis-worker`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-worker-secret": secret.data?.worker_secret ?? "" },
      body: "{}",
    }).catch(() => {});

    return json({ jobId: job.id, startedAt: job.started_at, status: "queued" });
  } catch (e) {
    console.error("start-analysis error:", e);
    return json({ error: "Could not start the analysis. Please try again." }, 500);
  }
});
