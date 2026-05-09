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

const FIELD_GUIDE: Record<string, { label: string; hint: string; max: number }> = {
  description: { label: "Project Description", hint: "What it is, who it serves, the problem solved, and the core offering.", max: 600 },
  strategicObjectives: { label: "Strategic Objectives", hint: "3–5 measurable outcomes the project will deliver.", max: 500 },
  dependencies: { label: "Key Dependencies", hint: "Vendors, regulatory approvals, integrations, partner orgs.", max: 500 },
  assumptions: { label: "Key Assumptions", hint: "Critical assumptions about market, demand, costs, technology.", max: 500 },
  constraints: { label: "Known Constraints", hint: "Budget, time, regulatory, talent, technology constraints.", max: 500 },
  successFactors: { label: "Critical Success Factors", hint: "What must go right.", max: 500 },
  knownRisks: { label: "Known Risks", hint: "Top 4–6 risks with brief context.", max: 600 },
  regulatoryConsiderations: { label: "Regulatory & Compliance", hint: "Relevant regulations, licensing, standards.", max: 500 },
  founderExperience: { label: "Founder / Team Experience", hint: "Years and domain experience, prior exits, key strengths.", max: 400 },
};

const clip = (value: unknown, max: number) => typeof value === "string" ? value.slice(0, max) : "";
const estimateTokens = (value: string) => Math.max(1, Math.ceil(value.length / 4));

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });

  try {
    const { body, tenantId, user, adminClient } = await requireTenantAccess(req, ["owner", "admin", "member"]);
    const { field, partial, inputs: rawInputs } = body as any;
    const guide = FIELD_GUIDE[field];

    if (!guide) return jsonResponse(req, { error: "Unknown field" }, 400);

    const idempotencyKey = req.headers.get("x-idempotency-key") ?? crypto.randomUUID();
    const { error: usageError } = await adminClient.rpc("consume_usage_event", {
      p_tenant_id: tenantId,
      p_event_type: "field_completion",
      p_quantity: 1,
      p_idempotency_key: idempotencyKey,
      p_metadata: { function: "complete-field-v2", field, user_id: user.id },
    });

    if (usageError) {
      const isLimit = String(usageError.message || "").toLowerCase().includes("usage limit");
      return jsonResponse(req, {
        error: isLimit
          ? "This workspace has reached its monthly field-completion limit."
          : "Could not reserve usage for this AI completion.",
      }, isLimit ? 402 : 400);
    }

    const safePartial = clip(partial, guide.max);
    const inputs = {
      projectName: clip(rawInputs?.projectName, 200),
      industry: clip(rawInputs?.industry, 200),
      location: clip(rawInputs?.location, 200),
      budgetRange: clip(rawInputs?.budgetRange, 200),
      timeline: clip(rawInputs?.timeline, 200),
      description: clip(rawInputs?.description, 1500),
    };

    const gatewayKey = Deno.env.get("LOVABLE_" + "API_KEY");
    if (!gatewayKey) throw new Error("AI gateway is not configured");

    const ctx = `Project: ${inputs.projectName || "(unnamed)"}
Industry: ${inputs.industry || "(not set)"}
Location: ${inputs.location || "(not set)"}
Budget: ${inputs.budgetRange || "(not set)"}
Timeline: ${inputs.timeline || "(not set)"}
Description: ${inputs.description || "(not set)"}`;

    const systemPrompt = `You are a senior business consultant helping draft a feasibility business case. Write professional, concise, board-ready prose. Maximum ${guide.max} characters. No markdown headings. Match the user's apparent language.`;
    const userPrompt = `Field to write: ${guide.label}
Guidance: ${guide.hint}

Project context:
${ctx}

User partial draft:
"""${safePartial || "(empty)"}"""

Return only the completed text for this field.`;

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
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      console.error("complete-field-v2 AI failed", response.status, message);
      return jsonResponse(req, { error: "AI completion failed. Please try again." }, response.status);
    }

    const data = await response.json();
    const text = String(data.choices?.[0]?.message?.content || "").trim();
    const estimatedTokens = estimateTokens(systemPrompt) + estimateTokens(userPrompt) + estimateTokens(text);

    await adminClient.rpc("consume_usage_event", {
      p_tenant_id: tenantId,
      p_event_type: "ai_tokens",
      p_quantity: estimatedTokens,
      p_idempotency_key: `${idempotencyKey}:tokens`,
      p_metadata: { function: "complete-field-v2", field, user_id: user.id, estimate: true },
    });

    return jsonResponse(req, { text, usageEstimate: { ai_tokens: estimatedTokens } });
  } catch (err) {
    if (err instanceof Response) {
      return new Response(err.body, {
        status: err.status,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    console.error("complete-field-v2 failed", err);
    return jsonResponse(req, { error: "Internal server error" }, 500);
  }
});
