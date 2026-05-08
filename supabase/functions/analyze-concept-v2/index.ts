import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";

const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? "https://gentle-glow-galaxy.lovable.app,http://localhost:8080")
  .split(",")
  .map((x) => x.trim())
  .filter(Boolean);

const dimensions = ["financial", "market", "achievability", "risk", "timing", "operational"] as const;
type Dimension = typeof dimensions[number];
type Inputs = Record<string, string>;
type Report = Record<string, unknown>;

function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

function safePublicError(error: unknown) {
  if (!(error instanceof Error)) return "Analysis failed. Please try again.";
  if (error.message.startsWith("Invalid ")) return "The AI response did not match the expected report format. Please try again.";
  if (error.message.includes("LOVABLE_API_KEY") || error.message.includes("SUPABASE") || error.message.includes("gateway")) {
    return "Analysis service is temporarily unavailable. Please try again later.";
  }
  return "Analysis failed. Please try again.";
}

function getRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid report field: ${field}`);
  return value as Record<string, unknown>;
}

function getArray(value: unknown, field: string, min = 1) {
  if (!Array.isArray(value) || value.length < min) throw new Error(`Invalid report array: ${field}`);
  return value;
}

function assertString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Invalid report string: ${field}`);
}

function assertScore(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 10) throw new Error(`Invalid score: ${field}`);
}

function assertConfidence(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) throw new Error(`Invalid confidence: ${field}`);
}

function sanitizeInputs(raw: unknown): { ok: true; inputs: Inputs } | { ok: false; error: string; status: number } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "Invalid inputs payload", status: 400 };
  const inputs: Inputs = {};
  let total = 0;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== "string") continue;
    const clipped = value.trim().slice(0, 3000);
    inputs[key] = clipped;
    total += clipped.length;
    if (total > 18000) return { ok: false, error: "Input too large", status: 413 };
  }
  if (!inputs.projectName || !inputs.industry || !inputs.description) return { ok: false, error: "Missing required project fields", status: 400 };
  return { ok: true, inputs };
}

function validateReport(report: Report) {
  assertString(report.executiveSummary, "executiveSummary");
  const scores = getRecord(report.scores, "scores");
  dimensions.forEach((d) => assertScore(scores[d], `scores.${d}`));
  assertScore(scores.overall, "scores.overall");
  assertString(scores.verdict, "scores.verdict");

  const weights = scores.weights ? getRecord(scores.weights, "scores.weights") : null;
  if (weights) {
    const total = dimensions.reduce((sum, d) => {
      const v = weights[d];
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1) throw new Error(`Invalid weight: ${d}`);
      return sum + v;
    }, 0);
    if (Math.abs(total - 1) > 0.05) throw new Error("Invalid weights: sum must be 1");
  }

  const confidence = scores.confidence ? getRecord(scores.confidence, "scores.confidence") : null;
  if (confidence) dimensions.forEach((d: Dimension) => assertConfidence(confidence[d], `scores.confidence.${d}`));

  const financials = getRecord(report.financials, "financials");
  getArray(financials.capEx, "financials.capEx", 3);
  getArray(financials.opEx, "financials.opEx", 3);
  getArray(financials.scenarios, "financials.scenarios", 3);
  if ((financials.scenarios as unknown[]).length !== 3) throw new Error("Invalid financial scenarios: expected exactly 3");

  getRecord(report.market, "market");
  getRecord(report.customer, "customer");
  getArray(report.competitors, "competitors", 1);
  getArray(report.risks, "risks", 3);
  getArray(report.fundingMix, "fundingMix", 1);
  getArray(report.recommendations, "recommendations", 3);
  getArray(report.nextSteps, "nextSteps", 3);
}

async function checkRateLimit(userId: string) {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return { ok: true };
  const admin = createClient(url, serviceKey);
  const windowMs = 10 * 60 * 1000;
  const now = new Date();
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs).toISOString();
  const action = "analyze-concept-v2";

  const { data } = await admin
    .from("edge_rate_limits")
    .select("count")
    .eq("user_id", userId)
    .eq("action", action)
    .eq("window_start", windowStart)
    .maybeSingle();

  const count = Number(data?.count ?? 0) + 1;
  if (count > 8) return { ok: false };
  await admin.from("edge_rate_limits").upsert({ user_id: userId, action, window_start: windowStart, count, updated_at: now.toISOString() });
  return { ok: true };
}

const reportSchema = {
  type: "object",
  properties: {
    executiveSummary: { type: "string" },
    scores: { type: "object" },
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
  required: ["executiveSummary", "scores", "market", "customer", "competitors", "financials", "risks", "fundingMix", "fundingAdvisory", "recommendations", "nextSteps"],
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json(req, { error: "Please sign in to run an analysis." }, 401);

    const auth = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userError } = await auth.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userError || !userData?.user?.id) return json(req, { error: "Your session has expired. Please sign in again." }, 401);

    const limit = await checkRateLimit(userData.user.id);
    if (!limit.ok) return json(req, { error: "Too many requests. Please wait and try again." }, 429);

    const body = await req.json();
    const sanitized = sanitizeInputs(body?.inputs);
    if (!sanitized.ok) return json(req, { error: sanitized.error }, sanitized.status);

    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) throw new Error("LOVABLE_API_KEY missing");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(45000),
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are a senior feasibility consultant. Return a board-grade FMART feasibility report by calling provide_report. Scores must be 0-10. Confidence must be 0-100. Weights must sum to 1. Financial scenarios must be exactly three: Optimistic, Base Case, Pessimistic." },
          { role: "user", content: JSON.stringify({ inputs: sanitized.inputs }) },
        ],
        tools: [{ type: "function", function: { name: "provide_report", description: "Return the full feasibility report", parameters: reportSchema } }],
        tool_choice: { type: "function", function: { name: "provide_report" } },
      }),
    });

    if (!response.ok) {
      console.error("AI gateway failed", response.status);
      if (response.status === 429) return json(req, { error: "Rate limit exceeded. Try again shortly." }, 429);
      if (response.status === 402) return json(req, { error: "AI usage limit reached. Add credits to continue." }, 402);
      throw new Error("AI gateway unavailable");
    }

    const data = await response.json();
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("Invalid AI report");
    const report = JSON.parse(args) as Report;
    report.reportId = typeof report.reportId === "string" ? report.reportId : `FSB-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    report.dateIssued = typeof report.dateIssued === "string" ? report.dateIssued : new Date().toISOString().slice(0, 10);
    report.classification = typeof report.classification === "string" ? report.classification : "Confidential";
    report.preparedBy = typeof report.preparedBy === "string" ? report.preparedBy : "Concept AI";
    report.methodology = typeof report.methodology === "string" ? report.methodology : "FMART weighted feasibility scoring.";
    validateReport(report);
    return json(req, report);
  } catch (error) {
    console.error("analyze-concept-v2 failed", error);
    return json(req, { error: safePublicError(error) }, 500);
  }
});
