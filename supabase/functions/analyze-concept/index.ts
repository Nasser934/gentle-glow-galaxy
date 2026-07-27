import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { ensureEvidenceFields, deepSanitize } from "../_shared/evidence.ts";
import { kimiStructured, KimiError } from "../_shared/kimi.ts";
import {
  rateLimit,
  sanitizeInputs,
  fetchPublicResearch,
  reportSchema,
  buildPrompts,
  buildBaseReport,
} from "../_shared/analysisCore.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Require authenticated user (mitigates SSRF abuse and budget abuse)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Please sign in to run an analysis." }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    let userId: string | undefined;
    try {
      const { data: claimsData } = await supabaseAuth.auth.getClaims(token);
      userId = claimsData?.claims?.sub as string | undefined;
    } catch (_) { /* fall through to getUser */ }
    if (!userId) {
      const { data: userData, error: userErr } = await supabaseAuth.auth.getUser(token);
      if (userErr || !userData?.user?.id) {
        console.warn("auth failed:", userErr?.message);
        return new Response(JSON.stringify({ error: "Your session has expired. Please sign in again." }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = userData.user.id;
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("cf-connecting-ip") || "unknown";
    const rl = rateLimit(ip);
    if (!rl.ok) {
      return new Response(JSON.stringify({ error: "Too many requests. Please wait and try again." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(rl.retryAfter ?? 60) },
      });
    }

    const body = await req.json();
    const sanitized = sanitizeInputs(body?.inputs ?? {});
    if (!sanitized.ok) {
      return new Response(JSON.stringify({ error: sanitized.error }), {
        status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const inputs = sanitized.inputs;
    if (!inputs.projectName || !inputs.industry || !inputs.description) {
      return new Response(JSON.stringify({ error: "Missing required project fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // AI provider: Kimi Code only (see _shared/kimi.ts). No fallback providers.
    const publicResearch = await fetchPublicResearch(inputs);
    const { systemPrompt, userPrompt } = buildPrompts(inputs, publicResearch);

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

    const baseReport = buildBaseReport(parsed, publicResearch);

    // Server-side: fill missing evidence fields, compute authoritative verdict,
    // then sanitize every string leaf to strip internal/QA wording.
    const enriched = ensureEvidenceFields(baseReport, inputs);
    const report = deepSanitize(enriched);

    return new Response(JSON.stringify(report), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("analyze-concept error:", e);
    if (e instanceof KimiError) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: e.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: "Analysis failed. Please try again." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
