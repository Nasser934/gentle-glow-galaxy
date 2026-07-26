import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { kimiStructured, KimiError } from "../_shared/kimi.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_BRIEF_LEN = 1500;
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000 * 10;
const ipHits = new Map<string, number[]>();
function rateLimit(ip: string): { ok: boolean; retryAfter?: number } {
  const now = Date.now();
  const arr = (ipHits.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (arr.length >= RATE_LIMIT_MAX) return { ok: false, retryAfter: Math.ceil((RATE_LIMIT_WINDOW_MS - (now - arr[0])) / 1000) };
  arr.push(now); ipHits.set(ip, arr);
  return { ok: true };
}

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

    const { brief: rawBrief } = await req.json();
    if (!rawBrief || typeof rawBrief !== "string" || rawBrief.trim().length < 10) {
      return new Response(JSON.stringify({ error: "Brief must be at least 10 characters." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const brief = rawBrief.slice(0, MAX_BRIEF_LEN);

    // AI provider: Kimi Code only (see _shared/kimi.ts). No fallback providers.


    const systemPrompt = `You are a senior feasibility consultant. From a short business brief, draft a complete business case for downstream feasibility analysis.
Return STRUCTURED data via the provided tool. Be realistic, specific, and concise. Use the same language as the user's brief (English or Arabic). Default to English if mixed.`;

    const userPrompt = `Brief from the user:
"""${brief}"""

Generate a full draft business case. Choose realistic budget range, timeline, team size, technology readiness, and location/industry. Do NOT invent a different project — stay faithful to the brief.`;

    const draft = await kimiStructured(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      "draft_business_case",
      "Draft a complete business case from a short brief.",
      {
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
                    "Infrastructure / Capex Project","Government Contract / PPP","Other"
                  ]},
                  revenueModel: { type: "string", enum: [
                    "Recurring subscription","Transaction / commission fee","License / one-time sale",
                    "Usage-based metering","Advertising","Project / milestone billing",
                    "Tariff / regulated revenue","Mixed"
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
    );
    if (!draft || typeof draft !== "object" || !draft.projectName) {
      throw new KimiError(502, "AI did not return a valid draft.");
    }


    return new Response(JSON.stringify({ draft }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
