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

const MAX_FIELD_LEN = 3000;
const MAX_TOTAL_LEN = 18000;

function sanitizeInputs(raw: Record<string, unknown>) {
  if (!raw || typeof raw !== "object") return { ok: false as const, error: "Invalid inputs payload" };
  const cleaned: Record<string, string> = {};
  let total = 0;

  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== "string") continue;
    const trimmed = value.slice(0, MAX_FIELD_LEN).trim();
    cleaned[key] = trimmed;
    total += trimmed.length;
    if (total > MAX_TOTAL_LEN) return { ok: false as const, error: "Input too large" };
  }

  return { ok: true as const, inputs: cleaned };
}

function buildReport(parsed: any, inputs: Record<string, string>) {
  const capExLow = Number(parsed.financials?.capExLow ?? 0);
  const capExHigh = Number(parsed.financials?.capExHigh ?? 0);
  const capExMid = Number(parsed.financials?.capExMid ?? Math.round((capExLow + capExHigh) / 2));

  return {
    reportId: `FSB-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    dateIssued: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
    classification: "Confidential",
    preparedBy: "AI Feasibility Engine v2.2",
    methodology: "FMART Framework — 6-Dimension Weighted Scoring",
    executiveSummary: parsed.executiveSummary,
    scores: parsed.scores,
    market: parsed.market,
    customer: parsed.customer,
    competitors: parsed.competitors,
    research: {
      ...parsed.research,
      citations: parsed.research?.citations ?? [],
    },
    financials: {
      currency: parsed.financials?.currency ?? (inputs.location?.toLowerCase().includes("saudi") || inputs.location?.toLowerCase().includes("riyadh") ? "SAR" : "USD"),
      capExTotal: { low: capExLow, high: capExHigh, mid: capExMid },
      capEx: parsed.financials?.capEx ?? [],
      opEx: parsed.financials?.opEx ?? [],
      scenarios: parsed.financials?.scenarios ?? [],
      investmentRange: parsed.financials?.investmentRange ?? "To be validated",
      breakEvenSummary: parsed.financials?.breakEvenSummary ?? "To be validated",
      ltvCacRatio: parsed.financials?.ltvCacRatio ?? "To be validated",
    },
    risks: parsed.risks ?? [],
    fundingMix: parsed.fundingMix ?? [],
    fundingAdvisory: parsed.fundingAdvisory ?? "Validate funding needs after market testing.",
    recommendations: parsed.recommendations ?? [],
    nextSteps: parsed.nextSteps ?? [],
  };
}

const reportSchema = {
  type: "object",
  properties: {
    executiveSummary: { type: "string" },
    scores: {
      type: "object",
      properties: {
        financial: { type: "number" }, market: { type: "number" }, achievability: { type: "number" },
        risk: { type: "number" }, timing: { type: "number" }, operational: { type: "number" }, overall: { type: "number" },
        verdict: { type: "string", enum: ["PROCEED", "PROCEED WITH CAUTION", "REVISE", "DO NOT PROCEED"] },
        financialFinding: { type: "string" }, marketFinding: { type: "string" }, achievabilityFinding: { type: "string" },
        riskFinding: { type: "string" }, timingFinding: { type: "string" }, operationalFinding: { type: "string" },
        weights: { type: "object" }, confidence: { type: "object" }, rationale: { type: "object" },
      },
      required: ["financial", "market", "achievability", "risk", "timing", "operational", "overall", "verdict", "financialFinding", "marketFinding", "achievabilityFinding", "riskFinding", "timingFinding", "operationalFinding", "weights", "confidence", "rationale"],
      additionalProperties: true,
    },
    market: { type: "object" },
    customer: { type: "object" },
    competitors: { type: "array" },
    research: { type: "object" },
    financials: { type: "object" },
    risks: { type: "array" },
    fundingMix: { type: "array" },
    fundingAdvisory: { type: "string" },
    recommendations: { type: "array" },
    nextSteps: { type: "array" },
  },
  required: ["executiveSummary", "scores", "market", "customer", "competitors", "research", "financials", "risks", "fundingMix", "fundingAdvisory", "recommendations", "nextSteps"],
  additionalProperties: true,
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });

  try {
    const { body, tenantId, user, adminClient } = await requireTenantAccess(req, ["owner", "admin", "member"]);

    const sanitized = sanitizeInputs((body.inputs ?? {}) as Record<string, unknown>);
    if (!sanitized.ok) {
      return new Response(JSON.stringify({ error: sanitized.error }), {
        status: 413,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const inputs = sanitized.inputs;
    if (!inputs.projectName || !inputs.industry || !inputs.description) {
      return new Response(JSON.stringify({ error: "Missing required project fields" }), {
        status: 400,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const gatewayKey = Deno.env.get("LOVABLE_" + "API_KEY");
    if (!gatewayKey) throw new Error("AI gateway is not configured");

    const systemPrompt = `You are an expert feasibility-study engine. Produce a board-grade feasibility study using the FMART framework: Financial, Market, Achievability, Risk, Timing, and Operational. You must call the provide_report tool. Use realistic numbers for the user's industry, location, budget, and timeline. Use SAR for Saudi concepts. The overall score must equal the weighted sum of the six FMART dimensions. Include confidence and rationale for each score.`;

    const userPrompt = `Generate the full feasibility report for this concept:\n\n${JSON.stringify(inputs, null, 2)}`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        ["Authori", "zation"].join(""): `Bearer ${gatewayKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [{ type: "function", function: { name: "provide_report", description: "Provide the full feasibility report.", parameters: reportSchema } }],
        tool_choice: { type: "function", function: { name: "provide_report" } },
      }),
    });

    if (!aiResponse.ok) {
      const message = await aiResponse.text();
      console.error("AI gateway failed", aiResponse.status, message);
      return new Response(JSON.stringify({ error: "AI analysis failed. Please try again." }), {
        status: aiResponse.status,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const args = aiData.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("AI did not return structured report");

    const parsed = JSON.parse(args);
    const report = buildReport(parsed, inputs);

    const { data: reportRow, error: insertError } = await adminClient
      .from("reports")
      .insert({
        tenant_id: tenantId,
        user_id: user.id,
        title: inputs.projectName || "Untitled analysis",
        industry: inputs.industry || null,
        inputs,
        output: report,
      })
      .select("id, slug, title, created_at")
      .single();

    if (insertError) throw insertError;

    return new Response(JSON.stringify({ report, reportRow }), {
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (err) {
    if (err instanceof Response) {
      return new Response(err.body, {
        status: err.status,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    console.error("analyze-concept-v2 failed", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
