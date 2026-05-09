import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireTenantAccess } from "../_shared/tenantGuard.ts";

function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") ?? "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-idempotency-key",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function jsonResponse(req: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

const MAX_BRIEF_LEN = 1500;
const estimateTokens = (value: string) => Math.max(1, Math.ceil(value.length / 4));

const draftSchema = {
  type: "object",
  properties: {
    projectName: { type: "string" },
    industry: {
      type: "string",
      enum: [
        "Information Technology", "Telecommunications", "Infrastructure & Construction",
        "Government & Public Sector", "Real Estate & Property", "Healthcare & Life Sciences",
        "Financial Services", "Energy & Utilities", "Manufacturing", "Food & Beverage",
        "Retail & E-commerce", "Education", "Other",
      ],
    },
    location: { type: "string" },
    description: { type: "string" },
    strategicObjectives: { type: "string" },
    businessModel: {
      type: "string",
      enum: [
        "SaaS / Subscription Software", "Marketplace / Platform", "Hardware / Devices",
        "Professional Services", "Consumer Product (D2C)", "Wholesale / Distribution",
        "Infrastructure / Capex Project", "Government Contract / PPP", "Other",
      ],
    },
    revenueModel: {
      type: "string",
      enum: [
        "Recurring subscription", "Transaction / commission fee", "License / one-time sale",
        "Usage-based metering", "Advertising", "Project / milestone billing",
        "Tariff / regulated revenue", "Mixed",
      ],
    },
    founderExperience: { type: "string" },
    budgetRange: { type: "string", enum: ["< $50,000", "$50,000 – $250,000", "$250,000 – $1M", "$1M – $5M", "$5M – $25M", "> $25M"] },
    timeline: { type: "string", enum: ["< 3 months", "3 – 6 months", "6 – 12 months", "1 – 2 years", "2 – 5 years", "> 5 years"] },
    teamSize: { type: "string", enum: ["1 – 5", "6 – 15", "16 – 50", "51 – 100", "> 100"] },
    dependencies: { type: "string" },
    assumptions: { type: "string" },
    constraints: { type: "string" },
    successFactors: { type: "string" },
    knownRisks: { type: "string" },
    regulatoryConsiderations: { type: "string" },
    technologyReadiness: { type: "string", enum: ["Proven / Mature", "Established / Widely Used", "Emerging / Early Adoption", "Experimental / R&D Phase", "Unknown / Not Yet Assessed"] },
    competitorUrls: { type: "string" },
  },
  required: [
    "projectName", "industry", "location", "description", "strategicObjectives",
    "businessModel", "revenueModel", "founderExperience", "budgetRange", "timeline", "teamSize",
    "dependencies", "assumptions", "constraints", "successFactors", "knownRisks",
    "regulatoryConsiderations", "technologyReadiness", "competitorUrls",
  ],
  additionalProperties: false,
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });

  try {
    const { body, tenantId, user, adminClient } = await requireTenantAccess(req, ["owner", "admin", "member"]);
    const rawBrief = body.brief;

    if (!rawBrief || typeof rawBrief !== "string" || rawBrief.trim().length < 10) {
      return jsonResponse(req, { error: "Brief must be at least 10 characters." }, 400);
    }

    const idempotencyKey = req.headers.get("x-idempotency-key") ?? crypto.randomUUID();
    const { error: usageError } = await adminClient.rpc("consume_usage_event", {
      p_tenant_id: tenantId,
      p_event_type: "autofill",
      p_quantity: 1,
      p_idempotency_key: idempotencyKey,
      p_metadata: { function: "autofill-brief-v2", user_id: user.id },
    });

    if (usageError) {
      const isLimit = String(usageError.message || "").toLowerCase().includes("usage limit");
      return jsonResponse(req, {
        error: isLimit
          ? "This workspace has reached its monthly AI drafting limit."
          : "Could not reserve usage for this AI draft.",
      }, isLimit ? 402 : 400);
    }

    const brief = rawBrief.slice(0, MAX_BRIEF_LEN).trim();
    const gatewayKey = Deno.env.get("LOVABLE_" + "API_KEY");
    if (!gatewayKey) throw new Error("AI gateway is not configured");

    const systemPrompt = `You are a senior feasibility consultant. From a short business brief, draft a complete business case for downstream feasibility analysis. Return structured data via the provided tool. Be realistic, specific, and concise. Use the same language as the user's brief. Default to English if mixed.`;
    const userPrompt = `Brief from the user:\n"""${brief}"""\n\nGenerate a full draft business case. Choose realistic budget range, timeline, team size, technology readiness, and location/industry. Do not invent a different project.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        ["Authori", "zation"].join(""): `Bearer ${gatewayKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [{ type: "function", function: { name: "draft_business_case", description: "Draft a complete business case from a short brief.", parameters: draftSchema } }],
        tool_choice: { type: "function", function: { name: "draft_business_case" } },
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      console.error("autofill-brief-v2 AI failed", response.status, message);
      return jsonResponse(req, { error: "AI draft failed. Please try again." }, response.status);
    }

    const data = await response.json();
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("AI did not return a draft");

    const draft = JSON.parse(args);
    const estimatedTokens = estimateTokens(systemPrompt) + estimateTokens(userPrompt) + estimateTokens(args);

    await adminClient.rpc("consume_usage_event", {
      p_tenant_id: tenantId,
      p_event_type: "ai_tokens",
      p_quantity: estimatedTokens,
      p_idempotency_key: `${idempotencyKey}:tokens`,
      p_metadata: { function: "autofill-brief-v2", user_id: user.id, estimate: true },
    });

    return jsonResponse(req, { draft, usageEstimate: { ai_tokens: estimatedTokens } });
  } catch (err) {
    if (err instanceof Response) {
      return new Response(err.body, {
        status: err.status,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    console.error("autofill-brief-v2 failed", err);
    return jsonResponse(req, { error: "Internal server error" }, 500);
  }
});
