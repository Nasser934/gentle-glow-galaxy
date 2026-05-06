import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";

const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? "https://gentle-glow-galaxy.lovable.app,http://localhost:8080")
  .split(",")
  .map((x) => x.trim())
  .filter(Boolean);

type Inputs = Record<string, string>;
type Report = Record<string, unknown>;
type Template = {
  type: string;
  label: string;
  coreTerms: string[];
  bannedTerms: string[];
  competitors: string[];
  compliance: string[];
  risks: string[];
  gtmChannels: string[];
  recommendationRule: string;
};

const templates: Template[] = [
  {
    type: "healthcare_rpm",
    label: "Healthcare / RPM",
    coreTerms: ["HIPAA", "EHR integration", "device integration", "reimbursement", "clinical workflow", "patient adherence"],
    bannedTerms: ["inter-agency", "central treasury", "justice-to-health", "agency modernization", "cloud collaboration SaaS"],
    competitors: ["Medtronic", "Philips", "Dexcom", "Abbott", "Epic", "Oracle Health"],
    compliance: ["HIPAA", "FDA/SaMD classification", "patient consent", "clinical alert safety", "billing documentation", "SOC 2 roadmap"],
    risks: ["HIPAA breach", "EHR integration delay", "patient adherence", "clinician workflow rejection", "reimbursement capture failure"],
    gtmChannels: ["health system pilots", "specialty clinics", "payer/provider partnerships", "EHR marketplace"],
    recommendationRule: "Default to Conditional Proceed until provider adoption, integration feasibility, reimbursement capture and clinical workflow usage are validated.",
  },
  {
    type: "public_sector_data_exchange",
    label: "Public-sector / data exchange",
    coreTerms: ["FedRAMP", "agency adoption", "procurement", "data-sharing agreements", "legacy systems", "auditability"],
    bannedTerms: ["RPM reimbursement", "patient adherence", "clinician workflow", "remote patient monitoring", "EHR integration"],
    competitors: ["Palantir", "Tyler Technologies", "IBM", "Oracle", "Microsoft Azure Government", "Snowflake"],
    compliance: ["FedRAMP", "data-sharing agreements", "sovereign cloud", "audit logs", "procurement controls"],
    risks: ["agency adoption", "legacy integration", "policy shift", "security accreditation", "procurement delay"],
    gtmChannels: ["agency pilots", "systems integrators", "cloud marketplace", "policy workshops"],
    recommendationRule: "Use Conditional Proceed unless procurement path, accreditation, and agency sponsor are validated.",
  },
  {
    type: "enterprise_data_insights",
    label: "Enterprise data insights / BI analytics",
    coreTerms: ["business intelligence", "data insights", "analytics platform", "data ingestion", "data quality", "semantic layer", "governed KPIs", "self-service analytics", "time-to-insight"],
    bannedTerms: ["remote patient monitoring", "EHR integration", "patient adherence", "cloud collaboration SaaS", "team chat", "video meetings"],
    competitors: ["Power BI", "Tableau", "Looker", "Qlik", "ThoughtSpot", "Domo"],
    compliance: ["SOC 2", "ISO 27001", "SSO", "RBAC", "audit logs", "data access controls"],
    risks: ["poor data quality", "integration delays", "weak differentiation vs BI incumbents", "high CAC", "long enterprise sales cycle", "low adoption"],
    gtmChannels: ["CIO/CDO/CFO outbound", "department-led pilots", "BI modernization campaigns", "cloud marketplace"],
    recommendationRule: "Default to Conditional Proceed until paid pilots prove integrations, time-to-insight improvement, ACV, CAC payback, and retention.",
  },
  {
    type: "customer_data_platform",
    label: "Customer data platform / Unified customer profile",
    coreTerms: ["customer data platform", "CDP", "unified customer profile", "customer 360", "identity resolution", "consent management", "segmentation", "activation", "retention"],
    bannedTerms: ["cloud collaboration SaaS", "team chat", "remote patient monitoring", "EHR integration", "inter-agency"],
    competitors: ["Twilio Segment", "Salesforce Data Cloud", "Adobe Real-Time CDP", "Tealium", "mParticle", "Hightouch"],
    compliance: ["GDPR", "CCPA", "SOC 2", "ISO 27001", "consent management", "data deletion", "audit logs"],
    risks: ["identity resolution failure", "poor data quality", "consent violation", "integration complexity", "weak differentiation vs CDP incumbents"],
    gtmChannels: ["CMO/CDO/CIO outbound", "marketing operations pilots", "data consulting partners", "CRM partnerships"],
    recommendationRule: "Default to Conditional Proceed until identity resolution, privacy workflow, integrations, activation usage, ACV and CAC payback are validated.",
  },
  {
    type: "generic_saas",
    label: "Generic SaaS / cloud collaboration",
    coreTerms: ["ACV", "CAC", "churn", "LTV:CAC", "retention", "GTM", "product roadmap"],
    bannedTerms: ["HIPAA", "FDA/SaMD", "RPM reimbursement", "patient adherence", "inter-agency", "central treasury", "customer data platform", "identity resolution"],
    competitors: ["Microsoft Teams", "Slack", "Zoom", "Notion", "Asana", "Monday"],
    compliance: ["SOC 2", "privacy", "SSO", "RBAC", "security review"],
    risks: ["CAC inflation", "churn", "low conversion", "implementation cost", "competition"],
    gtmChannels: ["enterprise outbound", "PLG expansion", "cloud marketplace", "partners"],
    recommendationRule: "Proceed only when unit economics, retention and differentiation are validated.",
  },
];

function isAllowedOrigin(origin: string) {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return true;
    if (url.hostname === "gentle-glow-galaxy.lovable.app") return true;
    if (url.hostname.endsWith(".lovable.app")) return true;
    if (url.hostname.endsWith(".lovableproject.com")) return true;
    return allowedOrigins.includes(origin);
  } catch { return false; }
}

function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = isAllowedOrigin(origin) ? origin : allowedOrigins[0] ?? "*";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), "Content-Type": "application/json" } });
}

function safePublicError() {
  return "Analysis service is temporarily unavailable. Please try again later.";
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

function text(inputs: Inputs) {
  return `${inputs.projectName} ${inputs.industry} ${inputs.description} ${inputs.businessModel} ${inputs.revenueModel} ${inputs.knownRisks} ${inputs.regulatoryConsiderations}`.toLowerCase();
}

function resolveTemplate(inputs: Inputs): Template {
  const t = text(inputs);
  if (/remote patient|patient monitoring|\brpm\b|hospital|clinic|ehr|hipaa|healthcare/.test(t)) return templates[0];
  if (/inter-agency|data exchange|government|public sector|agency|fedramp/.test(t)) return templates[1];
  if (/unified customer profile|customer data platform|\bcdp\b|customer 360|identity resolution|first-party data|segmentation|activation|personalization/.test(t)) return templates[3];
  if (/data insights|business intelligence|\bbi platform\b|analytics platform|data intelligence|enterprise analytics|real-time insights|semantic layer|time-to-insight/.test(t)) return templates[2];
  return templates[4];
}

function stripBanned(report: Report, template: Template) {
  const replacements: Array<[RegExp, string]> = template.bannedTerms.map((term) => [new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "sector-specific validation"]);
  function cleanValue(value: unknown): unknown {
    if (typeof value === "string") return replacements.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), value);
    if (Array.isArray(value)) return value.map(cleanValue);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, cleanValue(v)]));
    return value;
  }
  return cleanValue(report) as Report;
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
function validateReport(report: Report) {
  assertString(report.executiveSummary, "executiveSummary");
  const scores = getRecord(report.scores, "scores");
  ["financial", "market", "achievability", "risk", "timing", "operational", "overall"].forEach((d) => assertScore(scores[d], `scores.${d}`));
  const financials = getRecord(report.financials, "financials");
  getArray(financials.capEx, "financials.capEx", 3);
  getArray(financials.opEx, "financials.opEx", 3);
  getArray(financials.scenarios, "financials.scenarios", 3);
  getRecord(report.market, "market");
  getRecord(report.customer, "customer");
  getArray(report.competitors, "competitors", 3);
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
  const { data } = await admin.from("edge_rate_limits").select("count").eq("user_id", userId).eq("action", action).eq("window_start", windowStart).maybeSingle();
  const count = Number(data?.count ?? 0) + 1;
  if (count > 8) return { ok: false };
  await admin.from("edge_rate_limits").upsert({ user_id: userId, action, window_start: windowStart, count, updated_at: now.toISOString() });
  return { ok: true };
}

const reportSchema = {
  type: "object",
  properties: {
    executiveSummary: { type: "string" },
    scores: { type: "object", properties: { financial: { type: "number" }, market: { type: "number" }, achievability: { type: "number" }, risk: { type: "number" }, timing: { type: "number" }, operational: { type: "number" }, overall: { type: "number" }, verdict: { type: "string" }, financialFinding: { type: "string" }, marketFinding: { type: "string" }, achievabilityFinding: { type: "string" }, riskFinding: { type: "string" }, timingFinding: { type: "string" }, operationalFinding: { type: "string" } }, required: ["financial", "market", "achievability", "risk", "timing", "operational", "overall", "verdict", "financialFinding", "marketFinding", "achievabilityFinding", "riskFinding", "timingFinding", "operationalFinding"] },
    market: { type: "object", properties: { currency: { type: "string" }, tamLabel: { type: "string" }, tamValue: { type: "string" }, tamCagr: { type: "string" }, samLabel: { type: "string" }, samValue: { type: "string" }, samCagr: { type: "string" }, somLabel: { type: "string" }, somValue: { type: "string" }, somCagr: { type: "string" }, growthChart: { type: "array", items: { type: "object" } } }, required: ["currency", "tamLabel", "tamValue", "tamCagr", "samLabel", "samValue", "samCagr", "somLabel", "somValue", "somCagr", "growthChart"] },
    customer: { type: "object", properties: { ageLocation: { type: "string" }, income: { type: "string" }, goals: { type: "string" }, willingnessToPay: { type: "string" }, behavior: { type: "string" } }, required: ["ageLocation", "income", "goals", "willingnessToPay", "behavior"] },
    competitors: { type: "array", items: { type: "object", properties: { name: { type: "string" }, model: { type: "string" }, weakness: { type: "string" }, edge: { type: "string" } }, required: ["name", "model", "weakness", "edge"] } },
    research: { type: "object", properties: { overview: { type: "string" }, confidence: { type: "string", enum: ["High", "Medium", "Low"] }, sentiment: { type: "string", enum: ["Positive", "Mixed", "Negative", "Insufficient data"] }, keySignals: { type: "array", items: { type: "string" } }, painPoints: { type: "array", items: { type: "string" } }, competitorMentions: { type: "array", items: { type: "string" } }, redditSignals: { type: "array", items: { type: "string" } }, webSignals: { type: "array", items: { type: "string" } }, citations: { type: "array", items: { type: "object" } } }, required: ["overview", "confidence", "sentiment", "keySignals", "painPoints", "competitorMentions", "redditSignals", "webSignals", "citations"] },
    financials: { type: "object", properties: { currency: { type: "string" }, capExTotal: { type: "object" }, capEx: { type: "array", items: { type: "object" } }, opEx: { type: "array", items: { type: "object" } }, scenarios: { type: "array", items: { type: "object" } }, investmentRange: { type: "string" }, breakEvenSummary: { type: "string" }, ltvCacRatio: { type: "string" } }, required: ["currency", "capExTotal", "capEx", "opEx", "scenarios", "investmentRange", "breakEvenSummary", "ltvCacRatio"] },
    risks: { type: "array", items: { type: "object" } },
    fundingMix: { type: "array", items: { type: "object" } },
    fundingAdvisory: { type: "string" },
    recommendations: { type: "array", items: { type: "string" } },
    nextSteps: { type: "array", items: { type: "string" } },
  },
  required: ["executiveSummary", "scores", "market", "customer", "competitors", "research", "financials", "risks", "fundingMix", "fundingAdvisory", "recommendations", "nextSteps"],
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
    const selectedTemplate = resolveTemplate(sanitized.inputs);
    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) throw new Error("AI service key missing");

    const systemPrompt = [
      "You are a senior feasibility consultant. Return only a professional consumer-facing feasibility report by calling provide_report.",
      "Never mention system diagnostics, template checks, internal status, fallback, debug details, stack traces, or repair logic.",
      `Use this report type only: ${selectedTemplate.label}.`,
      `Must include sector terms: ${selectedTemplate.coreTerms.join(", ")}.`,
      `Must avoid wrong-template terms: ${selectedTemplate.bannedTerms.join(", ")}.`,
      `Use relevant competitors: ${selectedTemplate.competitors.join(", ")}.`,
      `Use compliance path: ${selectedTemplate.compliance.join(", ")}.`,
      `Use risks: ${selectedTemplate.risks.join(", ")}.`,
      `Use GTM channels: ${selectedTemplate.gtmChannels.join(", ")}.`,
      `Recommendation rule: ${selectedTemplate.recommendationRule}`,
      "Scores must be 0-10. Financial scenarios must be exactly three: Optimistic, Base Case, Pessimistic.",
    ].join("\n");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(45000),
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: JSON.stringify({ inputs: sanitized.inputs, selectedTemplate }) }],
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
    if (!args) throw new Error("Invalid AI response");
    let report = JSON.parse(args) as Report;
    report = stripBanned(report, selectedTemplate);
    report.reportId = typeof report.reportId === "string" ? report.reportId : `FSB-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    report.dateIssued = typeof report.dateIssued === "string" ? report.dateIssued : new Date().toISOString().slice(0, 10);
    report.classification = "Confidential";
    report.preparedBy = "Concept AI";
    report.methodology = `FMART weighted feasibility scoring using ${selectedTemplate.label} template.`;
    validateReport(report);
    return json(req, report);
  } catch (error) {
    console.error("analyze-concept-v2 failed", error);
    return json(req, { error: safePublicError() }, 500);
  }
});
