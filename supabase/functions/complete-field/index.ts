import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { kimiText, KimiError } from "../_shared/kimi.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60_000 * 10;
const ipHits = new Map<string, number[]>();
function rateLimit(ip: string): { ok: boolean; retryAfter?: number } {
  const now = Date.now();
  const arr = (ipHits.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (arr.length >= RATE_LIMIT_MAX) return { ok: false, retryAfter: Math.ceil((RATE_LIMIT_WINDOW_MS - (now - arr[0])) / 1000) };
  arr.push(now); ipHits.set(ip, arr);
  return { ok: true };
}
const MAX_CTX_FIELD = 1500;
const clip = (s: unknown, n: number) => (typeof s === "string" ? s.slice(0, n) : "");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const rl = rateLimit(ip);
    if (!rl.ok) {
      return new Response(JSON.stringify({ error: "Too many requests. Please wait and try again." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(rl.retryAfter ?? 60) },
      });
    }

    const { field, partial, inputs: rawInputs } = await req.json();
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

    // AI provider: Kimi Code only (see _shared/kimi.ts). No fallback providers.


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

    const text = await kimiText([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);
    return new Response(JSON.stringify({ text }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    if (e instanceof KimiError) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: e.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
