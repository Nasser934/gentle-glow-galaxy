import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { pseudonymousIpHash } from "../_shared/rateLimit.ts";

const DEFAULT_ALLOWED_ORIGINS = new Set([
  "https://gentle-glow-galaxy.lovable.app",
  "http://localhost:5173",
  "http://localhost:8080",
]);

function corsFor(req: Request) {
  const configured = (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").map((value) => value.trim()).filter(Boolean);
  const allowed = new Set([...DEFAULT_ALLOWED_ORIGINS, ...configured]);
  const origin = req.headers.get("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, idempotency-key",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  if (origin && allowed.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const FIELD_GUIDE: Record<string, { label: string; hint: string; max: number }> = {
  description: { label: "Project Description", hint: "What it is, who it serves, the problem solved, and the core offering.", max: 600 },
  strategicObjectives: { label: "Strategic Objectives", hint: "3–5 measurable outcomes the project will deliver.", max: 500 },
  dependencies: { label: "Key Dependencies", hint: "Vendors, regulatory approvals, integrations, partner orgs.", max: 500 },
  assumptions: { label: "Key Assumptions", hint: "Critical assumptions about market, demand, costs, technology.", max: 500 },
  constraints: { label: "Known Constraints", hint: "Budget, time, regulatory, talent, technology constraints.", max: 500 },
  successFactors: { label: "Critical Success Factors", hint: "What must go right (3–6 bullets in prose).", max: 500 },
  knownRisks: { label: "Known Risks", hint: "Top 4–6 risks with brief context.", max: 600 },
  regulatoryConsiderations: { label: "Regulatory & Compliance", hint: "Relevant regulations, licensing, standards.", max: 500 },
  founderExperience: { label: "Founder / Team Experience", hint: "Years and domain experience, prior exits, key strengths.", max: 400 },
};

const MAX_CTX_FIELD = 1500;
const clip = (s: unknown, n: number) => (typeof s === "string" ? s.slice(0, n) : "");

serve(async (req) => {
  const corsHeaders = corsFor(req);
  const origin = req.headers.get("origin");
  if (origin && !corsHeaders["Access-Control-Allow-Origin"]) return new Response("Forbidden", { status: 403 });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  let requestId: string | null = null;
  let requestClient: ReturnType<typeof createClient> | null = null;
  let modelId: string | null = null;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    requestClient = supabaseAuth;
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { field, partial, inputs: rawInputs, idempotencyKey: suppliedKey } = await req.json();
    const guide = FIELD_GUIDE[field];
    if (!guide) {
      return new Response(JSON.stringify({ error: "Unknown field" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const safePartial = clip(partial, guide.max);
    const inputs = {
      projectName: clip(rawInputs?.projectName, 200),
      industry: clip(rawInputs?.industry, 200),
      location: clip(rawInputs?.location, 200),
      budgetRange: clip(rawInputs?.budgetRange, 200),
      timeline: clip(rawInputs?.timeline, 200),
      description: clip(rawInputs?.description, MAX_CTX_FIELD),
    };
    const requestHash = await sha256(JSON.stringify({ field, partial: safePartial, inputs }));
    const idempotencyKey = typeof suppliedKey === "string" && /^[A-Za-z0-9._:-]{16,128}$/.test(suppliedKey)
      ? suppliedKey
      : `legacy-${requestHash.slice(0, 40)}-${Math.floor(Date.now() / 60_000)}`;
    const ipHash = await pseudonymousIpHash(req);
    const { data: requestRows, error: requestError } = await supabaseAuth.rpc("begin_analysis_request", {
      p_function_name: "complete-field",
      p_idempotency_key: idempotencyKey,
      p_request_hash: `sha256:${requestHash}`,
      p_ip_hash: ipHash,
    });
    if (requestError || !requestRows?.length) return new Response(JSON.stringify({ error: "AI field completion is temporarily unavailable." }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" } });
    const decision = requestRows[0] as { request_id: string | null; allowed: boolean; reason: string; retry_after_seconds: number };
    requestId = decision.request_id;
    if (!decision.allowed) return new Response(JSON.stringify({ error: decision.reason === "duplicate_request" ? "This field request is already running." : "Usage limit reached." }), {
      status: decision.reason === "duplicate_request" ? 409 : 429,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(decision.retry_after_seconds || 30) },
    });

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
    modelId = Deno.env.get("COMPLETE_FIELD_MODEL_ID") || Deno.env.get("ANALYSIS_MODEL_ID") || "google/gemini-2.5-flash";

    const ctx = `Project: ${inputs?.projectName || "(unnamed)"}
Industry: ${inputs?.industry || "(not set)"}
Location: ${inputs?.location || "(not set)"}
Budget: ${inputs?.budgetRange || "(not set)"}
Timeline: ${inputs?.timeline || "(not set)"}
Description: ${inputs?.description || "(not set)"}`;

    const systemPrompt = `You are a senior business consultant helping draft a feasibility business case.
Write professional, concise, board-ready prose. No markdown headings, no bullet symbols (use plain numbered or dash lines if needed).
Maximum ${guide.max} characters. Single coherent block of text. Do not invent the project name. Match the user's apparent language (English/Arabic) — default to English.`;

    const userPrompt = `Field to write: **${guide.label}**
Guidance: ${guide.hint}

Project context:
${ctx}

User's partial draft (continue / complete naturally — keep their wording when present):
"""${safePartial || "(empty)"}"""

Return ONLY the completed text for this field.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
      signal: AbortSignal.timeout(45_000),
    });

    if (!response.ok) {
      console.error(JSON.stringify({ event: "complete_field_ai_failed", requestId, status: response.status }));
      throw new Error(`AI gateway ${response.status}`);
    }

    const data = await response.json();
    const text = (data.choices?.[0]?.message?.content || "").trim();
    if (!text) throw new Error("AI did not return text");
    if (requestId) {
      const { data: completionAccepted, error: completionError } = await supabaseAuth.rpc("complete_analysis_request", {
        p_request_id: requestId,
        p_completion_status: "completed",
        p_model_id: modelId,
        p_prompt_version: "complete-field-2026-07-18.1",
        p_usage_metadata: {},
        p_research_status: "not_requested",
        p_failure_category: null,
      });
      if (completionError || completionAccepted !== true) {
        throw new Error("Field completion could not be recorded");
      }
      requestId = null;
    }
    return new Response(JSON.stringify({ text }), { headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
  } catch (_) {
    if (requestId && requestClient) {
      try {
        await requestClient.rpc("complete_analysis_request", {
          p_request_id: requestId,
          p_completion_status: "failed",
          p_model_id: modelId,
          p_prompt_version: "complete-field-2026-07-18.1",
          p_usage_metadata: {},
          p_research_status: "not_requested",
          p_failure_category: "complete_field_failed",
        });
      } catch (_) {
        console.warn(JSON.stringify({ event: "complete_field_failure_log_failed", requestId }));
      }
    }
    console.error(JSON.stringify({ event: "complete_field_failed", requestId }));
    return new Response(JSON.stringify({ error: "Could not prepare a field suggestion. Please try again." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
});
