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

const MAX_BRIEF_LEN = 1500;

serve(async (req) => {
  const corsHeaders = corsFor(req);
  const origin = req.headers.get("origin");
  if (origin && !corsHeaders["Access-Control-Allow-Origin"]) return new Response("Forbidden", { status: 403 });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  let requestId: string | null = null;
  let requestClient: ReturnType<typeof createClient> | null = null;
  let modelId: string | null = null;
  let failureCategory = "autofill_failed";
  let failureStatus = 500;

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
    const { brief: rawBrief, idempotencyKey: suppliedKey } = await req.json();
    if (!rawBrief || typeof rawBrief !== "string" || rawBrief.trim().length < 10) {
      return new Response(JSON.stringify({ error: "Brief must be at least 10 characters." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const brief = rawBrief.slice(0, MAX_BRIEF_LEN);
    const requestHash = await sha256(brief);
    const idempotencyKey = typeof suppliedKey === "string" && /^[A-Za-z0-9._:-]{16,128}$/.test(suppliedKey)
      ? suppliedKey
      : `legacy-${requestHash.slice(0, 40)}-${Math.floor(Date.now() / 60_000)}`;
    const ipHash = await pseudonymousIpHash(req);
    const { data: requestRows, error: requestError } = await supabaseAuth.rpc("begin_analysis_request", {
      p_function_name: "autofill-brief",
      p_idempotency_key: idempotencyKey,
      p_request_hash: `sha256:${requestHash}`,
      p_ip_hash: ipHash,
    });
    if (requestError || !requestRows?.length) return new Response(JSON.stringify({ error: "AI drafting is temporarily unavailable." }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" } });
    const decision = requestRows[0] as { request_id: string | null; allowed: boolean; reason: string; retry_after_seconds: number };
    requestId = decision.request_id;
    if (!decision.allowed) return new Response(JSON.stringify({ error: decision.reason === "duplicate_request" ? "This draft request is already running." : "Usage limit reached." }), {
      status: decision.reason === "duplicate_request" ? 409 : 429,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(decision.retry_after_seconds || 30) },
    });

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
    modelId = Deno.env.get("AUTOFILL_MODEL_ID") || Deno.env.get("ANALYSIS_MODEL_ID") || "google/gemini-2.5-flash";

    const systemPrompt = `You are a senior feasibility consultant. From a short business brief, draft a complete business case for downstream feasibility analysis.
Return STRUCTURED data via the provided tool. Be realistic, specific, and concise. Use the same language as the user's brief (English or Arabic). Default to English if mixed.`;

    const userPrompt = `Brief from the user:
"""${brief}"""

Generate a full draft business case. Choose realistic budget range, timeline, team size, technology readiness, and location/industry. Do NOT invent a different project — stay faithful to the brief.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "draft_business_case",
              description: "Draft a complete business case from a short brief.",
              parameters: {
                type: "object",
                properties: {
                  projectName: { type: "string" },
                  industry: { type: "string", enum: [
                    "Information Technology","Telecommunications","Infrastructure & Construction",
                    "Government & Public Sector","Real Estate & Property","Healthcare & Life Sciences",
                    "Financial Services","Energy & Utilities","Manufacturing","Food & Beverage",
                    "Retail & E-commerce","Education","Other"
                  ]},
                  location: { type: "string", description: "City and/or country" },
                  description: { type: "string" },
                  strategicObjectives: { type: "string" },
                  businessModel: { type: "string", enum: [
                    "SaaS / Subscription Software","Marketplace / Platform","Hardware / Devices",
                    "Professional Services","Consumer Product (D2C)","Wholesale / Distribution",
                    "Infrastructure / Capex Project","Government Contract / PPP","Internal Platform / Cost Avoidance","Other"
                  ]},
                  revenueModel: { type: "string", enum: [
                    "Recurring subscription","Transaction / commission fee","License / one-time sale",
                    "Usage-based metering","Advertising","Project / milestone billing",
                    "Tariff / regulated revenue","Cost avoidance / productivity benefit","Mixed"
                  ]},
                  founderExperience: { type: "string", description: "1-2 sentences: years and domain experience." },
                  budgetRange: { type: "string", enum: ["< $50,000","$50,000 – $250,000","$250,000 – $1M","$1M – $5M","$5M – $25M","> $25M"] },
                  timeline: { type: "string", enum: ["< 3 months","3 – 6 months","6 – 12 months","1 – 2 years","2 – 5 years","> 5 years"] },
                  teamSize: { type: "string", enum: ["1 – 5","6 – 15","16 – 50","51 – 100","> 100"] },
                  dependencies: { type: "string" },
                  assumptions: { type: "string" },
                  constraints: { type: "string" },
                  successFactors: { type: "string" },
                  knownRisks: { type: "string" },
                  regulatoryConsiderations: { type: "string" },
                  technologyReadiness: { type: "string", enum: ["Proven / Mature","Established / Widely Used","Emerging / Early Adoption","Experimental / R&D Phase","Unknown / Not Yet Assessed"] },
                  competitorUrls: { type: "string", description: "Empty string — user will fill manually." },
                },
                required: [
                  "projectName","industry","location","description","strategicObjectives",
                  "businessModel","revenueModel","founderExperience",
                  "budgetRange","timeline","teamSize","dependencies","assumptions",
                  "constraints","successFactors","knownRisks","regulatoryConsiderations","technologyReadiness",
                  "competitorUrls"
                ],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "draft_business_case" } },
      }),
      signal: AbortSignal.timeout(45_000),
    });

    if (!response.ok) {
      console.error(JSON.stringify({ event: "autofill_ai_failed", requestId, status: response.status }));
      failureCategory = response.status === 429 ? "ai_rate_limited" : "ai_upstream";
      failureStatus = response.status === 429 ? 429 : 502;
      throw new Error(`AI gateway ${response.status}`);
    }

    const data = await response.json();
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) {
      failureCategory = "ai_response_invalid";
      failureStatus = 502;
      throw new Error("AI did not return a draft");
    }
    let draft: unknown;
    try {
      draft = JSON.parse(args);
    } catch {
      failureCategory = "ai_response_invalid";
      failureStatus = 502;
      throw new Error("AI returned an invalid draft");
    }

    if (requestId) {
      const { data: completionAccepted, error: completionError } = await supabaseAuth.rpc("complete_analysis_request", {
        p_request_id: requestId,
        p_completion_status: "completed",
        p_model_id: modelId,
        p_prompt_version: "autofill-2026-07-18.1",
        p_usage_metadata: {},
        p_research_status: "not_requested",
        p_failure_category: null,
      });
      if (completionError || completionAccepted !== true) {
        failureCategory = "usage_logging";
        failureStatus = 503;
        throw new Error("Autofill completion could not be recorded");
      }
      requestId = null;
    }

    return new Response(JSON.stringify({ draft }), { headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")) {
      failureCategory = "ai_timeout";
      failureStatus = 504;
    }
    if (requestId && requestClient) {
      try {
        await requestClient.rpc("complete_analysis_request", {
          p_request_id: requestId,
          p_completion_status: "failed",
          p_model_id: modelId,
          p_prompt_version: "autofill-2026-07-18.1",
          p_usage_metadata: {},
          p_research_status: "not_requested",
          p_failure_category: failureCategory,
        });
      } catch (_) {
        console.warn(JSON.stringify({ event: "autofill_failure_log_failed", requestId }));
      }
    }
    console.error(JSON.stringify({ event: "autofill_failed", requestId, category: failureCategory }));
    return new Response(JSON.stringify({ error: "Could not generate draft suggestions. Please try again." }), {
      status: failureStatus,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
});
