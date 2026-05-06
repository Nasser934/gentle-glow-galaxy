import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";

const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? "https://gentle-glow-galaxy.lovable.app,http://localhost:8080")
  .split(",")
  .map((x) => x.trim())
  .filter(Boolean);

type Inputs = Record<string, string>;
type Report = Record<string, unknown>;
type Citation = { title: string; url: string; source: string; takeaway: string };
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
  searchQueries: string[];
};

const templates: Record<string, Template> = {
  healthcare_rpm: {
    type: "healthcare_rpm",
    label: "Healthcare / remote patient monitoring",
    coreTerms: ["HIPAA", "EHR integration", "device integration", "reimbursement", "clinical workflow", "patient adherence"],
    bannedTerms: ["inter-agency", "GMV", "take rate", "anchor suppliers", "investment committee"],
    competitors: ["Medtronic", "Philips", "Dexcom", "Abbott", "Epic", "Oracle Health"],
    compliance: ["HIPAA", "FDA/SaMD classification", "patient consent", "clinical alert safety", "SOC 2"],
    risks: ["HIPAA breach", "EHR integration delay", "patient adherence", "alert fatigue", "reimbursement failure"],
    gtmChannels: ["health system pilots", "specialty clinics", "payer/provider partnerships", "EHR marketplace"],
    recommendationRule: "Default to Conditional Proceed until provider adoption, integration feasibility and clinical workflow usage are validated.",
    searchQueries: ["remote patient monitoring market HIPAA EHR reimbursement"]
  },
  public_sector_data_exchange: {
    type: "public_sector_data_exchange",
    label: "Public-sector data exchange",
    coreTerms: ["FedRAMP", "agency adoption", "procurement", "data-sharing agreements", "legacy systems", "auditability"],
    bannedTerms: ["patient adherence", "EHR integration", "GMV", "take rate", "portfolio alpha"],
    competitors: ["Palantir", "Tyler Technologies", "IBM", "Oracle", "Microsoft Azure Government", "Snowflake"],
    compliance: ["FedRAMP", "data-sharing agreements", "sovereign cloud", "audit logs", "procurement controls"],
    risks: ["agency adoption", "legacy integration", "policy shift", "security accreditation", "procurement delay"],
    gtmChannels: ["agency pilots", "systems integrators", "cloud marketplace", "policy workshops"],
    recommendationRule: "Use Conditional Proceed unless procurement path, accreditation and agency sponsor are validated.",
    searchQueries: ["government data exchange platform FedRAMP procurement market"]
  },
  identity_verification: {
    type: "identity_verification",
    label: "Identity verification / security SaaS",
    coreTerms: ["KYC", "AML", "liveness detection", "document verification", "PII", "fraud reduction", "GDPR", "eIDAS", "audit logs"],
    bannedTerms: ["portfolio alpha", "investment committee", "GMV", "take rate", "anchor suppliers"],
    competitors: ["Onfido", "Jumio", "Persona", "ID.me", "Trulioo", "Sumsub"],
    compliance: ["KYC/AML", "GDPR", "eIDAS", "SOC 2", "PII security", "data residency"],
    risks: ["data breach", "false rejection", "regulatory change", "high CAC", "competitor dominance"],
    gtmChannels: ["developer-led API pilots", "fintech/e-commerce pilots", "systems integrators", "cloud marketplace"],
    recommendationRule: "Use Conditional Proceed until security, compliance, verification quality, API adoption and paid pilots are validated.",
    searchQueries: ["digital identity verification market KYC AML Onfido Jumio Persona"]
  },
  enterprise_workflow: {
    type: "enterprise_workflow",
    label: "Enterprise workflow automation SaaS",
    coreTerms: ["workflow automation", "ERP integration", "HRIS integration", "SSO", "RBAC", "audit logs", "SOC 2", "customer success", "NRR"],
    bannedTerms: ["GMV", "take rate", "anchor suppliers", "supplier liquidity", "portfolio alpha", "investment committee"],
    competitors: ["Monday.com", "Jira Service Management", "ServiceNow", "Asana", "Workato", "Zapier"],
    compliance: ["SOC 2", "GDPR", "SSO", "RBAC", "audit logs", "data retention"],
    risks: ["long enterprise sales cycle", "implementation burden", "low adoption", "integration complexity", "security review failure"],
    gtmChannels: ["enterprise outbound", "systems integrators", "workflow pilots", "customer expansion"],
    recommendationRule: "Proceed only if security review, implementation cost, adoption and renewal path are credible.",
    searchQueries: ["enterprise workflow automation software market ServiceNow Monday Asana Jira"]
  },
  enterprise_data_insights: {
    type: "enterprise_data_insights",
    label: "Enterprise data insights / BI analytics",
    coreTerms: ["business intelligence", "data ingestion", "data quality", "semantic layer", "governed KPIs", "self-service analytics", "time-to-insight"],
    bannedTerms: ["remote patient monitoring", "EHR integration", "GMV", "take rate", "anchor suppliers"],
    competitors: ["Power BI", "Tableau", "Looker", "Qlik", "ThoughtSpot", "Domo"],
    compliance: ["SOC 2", "ISO 27001", "SSO", "RBAC", "audit logs", "data access controls"],
    risks: ["poor data quality", "integration delays", "weak differentiation", "high CAC", "long enterprise sales cycle"],
    gtmChannels: ["CIO/CDO/CFO outbound", "department-led pilots", "BI modernization campaigns", "cloud marketplace"],
    recommendationRule: "Default to Conditional Proceed until paid pilots prove integrations, time-to-insight improvement, ACV, CAC payback and retention.",
    searchQueries: ["business intelligence analytics platform market Power BI Tableau Looker"]
  },
  customer_data_platform: {
    type: "customer_data_platform",
    label: "Customer data platform",
    coreTerms: ["CDP", "customer 360", "identity resolution", "consent management", "segmentation", "activation", "LTV"],
    bannedTerms: ["remote patient monitoring", "inter-agency", "GMV", "take rate"],
    competitors: ["Twilio Segment", "Salesforce Data Cloud", "Adobe Real-Time CDP", "Tealium", "mParticle", "Hightouch"],
    compliance: ["GDPR", "CCPA", "SOC 2", "consent management", "data deletion", "audit logs"],
    risks: ["identity resolution failure", "poor data quality", "consent violation", "integration complexity"],
    gtmChannels: ["CMO/CDO outbound", "marketing operations pilots", "data consulting partners", "CRM partnerships"],
    recommendationRule: "Use Conditional Proceed until identity resolution, privacy workflow, integrations, activation and CAC payback are validated.",
    searchQueries: ["customer data platform CDP market Segment Salesforce Data Cloud Adobe"]
  },
  marketplace: {
    type: "marketplace",
    label: "B2B marketplace / procurement platform",
    coreTerms: ["liquidity", "supply", "demand", "take rate", "GMV", "network effects", "retention"],
    bannedTerms: ["workflow automation", "ERP/HRIS", "task assignment", "portfolio alpha", "investment committee"],
    competitors: ["Tradeling", "Moglix", "Alibaba Business", "Amazon Business", "SAP Ariba"],
    compliance: ["payments", "platform policies", "trust and safety", "tax invoicing"],
    risks: ["cold start", "low liquidity", "CAC", "supply quality", "trust issues"],
    gtmChannels: ["supply acquisition", "demand acquisition", "partnerships", "community loops"],
    recommendationRule: "Proceed only if one side of the marketplace can be seeded cheaply and retained.",
    searchQueries: ["B2B procurement marketplace market Tradeling Moglix Amazon Business"]
  },
  generic_saas: {
    type: "generic_saas",
    label: "SaaS feasibility",
    coreTerms: ["ACV", "CAC", "churn", "LTV:CAC", "retention", "GTM", "roadmap"],
    bannedTerms: ["GMV", "take rate", "HIPAA", "FedRAMP", "portfolio alpha"],
    competitors: ["Microsoft", "Google", "Salesforce", "Oracle", "Atlassian"],
    compliance: ["SOC 2", "privacy", "SSO", "RBAC", "security review"],
    risks: ["CAC inflation", "churn", "low conversion", "implementation cost", "competition"],
    gtmChannels: ["enterprise outbound", "PLG", "cloud marketplace", "partners"],
    recommendationRule: "Proceed only when unit economics, retention and differentiation are validated.",
    searchQueries: ["SaaS market ACV CAC churn benchmarks"]
  }
};

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
  return { "Access-Control-Allow-Origin": allowed, "Vary": "Origin", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version" };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), "Content-Type": "application/json" } });
}
function safePublicError() { return "Analysis service is temporarily unavailable. Please try again later."; }
function text(inputs: Inputs) { return `${inputs.projectName} ${inputs.industry} ${inputs.description} ${inputs.businessModel} ${inputs.revenueModel} ${inputs.knownRisks} ${inputs.regulatoryConsiderations} ${inputs.dependencies} ${inputs.assumptions}`.toLowerCase(); }
function resolveTemplate(inputs: Inputs): Template {
  const t = text(inputs);
  if (/remote patient|patient monitoring|\brpm\b|hospital|clinic|ehr|hipaa|healthcare|clinical/.test(t)) return templates.healthcare_rpm;
  if (/inter-agency|secure data exchange|government data|public sector|agency|fedramp|sovereign cloud|govtech/.test(t)) return templates.public_sector_data_exchange;
  if (/identity verification|digital identity|id verification|liveness|biometric|eidas|kyc|aml|fraud reduction/.test(t)) return templates.identity_verification;
  if (/customer data platform|\bcdp\b|customer 360|unified customer|identity resolution|first-party data/.test(t)) return templates.customer_data_platform;
  if (/workflow automation|enterprise workflow|task assignment|task tracking|cross-departmental|orchestration|erp\/hris|hris|approval workflow|work about work/.test(t)) return templates.enterprise_workflow;
  if (/data insights|business intelligence|\bbi platform\b|enterprise analytics|semantic layer|time-to-insight/.test(t)) return templates.enterprise_data_insights;
  if (/marketplace|b2b procurement platform|procurement marketplace|supplier marketplace|rfq platform|gmv|take rate/.test(t)) return templates.marketplace;
  return templates.generic_saas;
}
function sanitizeInputs(raw: unknown): { ok: true; inputs: Inputs } | { ok: false; error: string; status: number } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "Invalid inputs payload", status: 400 };
  const inputs: Inputs = {}; let total = 0;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== "string") continue;
    const clipped = value.trim().slice(0, 3000); inputs[key] = clipped; total += clipped.length;
    if (total > 18000) return { ok: false, error: "Input too large", status: 413 };
  }
  if (!inputs.projectName || !inputs.industry || !inputs.description) return { ok: false, error: "Missing required project fields", status: 400 };
  return { ok: true, inputs };
}
function stripBanned(value: unknown, template: Template): unknown {
  if (typeof value === "string") return template.bannedTerms.reduce((out, term) => out.replace(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "sector-specific validation"), value);
  if (Array.isArray(value)) return value.map((v) => stripBanned(v, template));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, stripBanned(v, template)]));
  return value;
}
function getRecord(value: unknown, field: string): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid report field: ${field}`); return value as Record<string, unknown>; }
function getArray(value: unknown, field: string, min = 1) { if (!Array.isArray(value) || value.length < min) throw new Error(`Invalid report array: ${field}`); return value; }
function assertString(value: unknown, field: string) { if (typeof value !== "string" || !value.trim()) throw new Error(`Invalid report string: ${field}`); }
function assertScore(value: unknown, field: string) { if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 10) throw new Error(`Invalid score: ${field}`); }
function validateReport(report: Report) {
  assertString(report.executiveSummary, "executiveSummary");
  const scores = getRecord(report.scores, "scores");
  ["financial", "market", "achievability", "risk", "timing", "operational", "overall"].forEach((d) => assertScore(scores[d], `scores.${d}`));
  const financials = getRecord(report.financials, "financials");
  getArray(financials.capEx, "financials.capEx", 3); getArray(financials.opEx, "financials.opEx", 3); getArray(financials.scenarios, "financials.scenarios", 3);
  getRecord(report.market, "market"); getRecord(report.customer, "customer"); getArray(report.competitors, "competitors", 3); getArray(report.risks, "risks", 3); getArray(report.fundingMix, "fundingMix", 1); getArray(report.recommendations, "recommendations", 3); getArray(report.nextSteps, "nextSteps", 3);
}
async function checkRateLimit(userId: string) {
  const url = Deno.env.get("SUPABASE_URL"); const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); if (!url || !serviceKey) return { ok: true };
  const admin = createClient(url, serviceKey); const windowMs = 10 * 60 * 1000; const now = new Date(); const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs).toISOString(); const action = "analyze-concept-v2";
  const { data } = await admin.from("edge_rate_limits").select("count").eq("user_id", userId).eq("action", action).eq("window_start", windowStart).maybeSingle();
  const count = Number(data?.count ?? 0) + 1; if (count > 8) return { ok: false };
  await admin.from("edge_rate_limits").upsert({ user_id: userId, action, window_start: windowStart, count, updated_at: now.toISOString() }); return { ok: true };
}
async function tavilyResearch(inputs: Inputs, template: Template): Promise<{ answer: string; citations: Citation[] }> {
  const key = Deno.env.get("TAVILY_API_KEY"); if (!key) return { answer: "", citations: [] };
  const query = [inputs.projectName, inputs.industry, inputs.location, template.searchQueries[0]].filter(Boolean).join(" ").slice(0, 420);
  try {
    const response = await fetch("https://api.tavily.com/search", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(12000), body: JSON.stringify({ api_key: key, query, search_depth: "advanced", max_results: 8, include_answer: true, include_raw_content: false }) });
    if (!response.ok) return { answer: "", citations: [] };
    const data = await response.json();
    const citations = (Array.isArray(data.results) ? data.results : []).slice(0, 8).map((item: Record<string, unknown>) => {
      const url = String(item.url ?? ""); let source = "Tavily"; try { source = new URL(url).hostname.replace(/^www\./, ""); } catch { /* noop */ }
      return { title: String(item.title ?? source).slice(0, 160), url, source, takeaway: String(item.content ?? "Supports market context.").replace(/\s+/g, " ").slice(0, 260) };
    }).filter((item: Citation) => item.url && item.title);
    return { answer: String(data.answer ?? "").slice(0, 600), citations };
  } catch { return { answer: "", citations: [] }; }
}
const reportSchema = { type: "object", properties: { executiveSummary: { type: "string" }, scores: { type: "object" }, market: { type: "object" }, customer: { type: "object" }, competitors: { type: "array", items: { type: "object" } }, research: { type: "object" }, financials: { type: "object" }, risks: { type: "array", items: { type: "object" } }, fundingMix: { type: "array", items: { type: "object" } }, fundingAdvisory: { type: "string" }, recommendations: { type: "array", items: { type: "string" } }, nextSteps: { type: "array", items: { type: "string" } }, implementationRoadmap: { type: "object" } }, required: ["executiveSummary", "scores", "market", "customer", "competitors", "research", "financials", "risks", "fundingMix", "fundingAdvisory", "recommendations", "nextSteps"] };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  try {
    const authHeader = req.headers.get("Authorization"); if (!authHeader?.startsWith("Bearer ")) return json(req, { error: "Please sign in to run an analysis." }, 401);
    const auth = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userError } = await auth.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userError || !userData?.user?.id) return json(req, { error: "Your session has expired. Please sign in again." }, 401);
    const limit = await checkRateLimit(userData.user.id); if (!limit.ok) return json(req, { error: "Too many requests. Please wait and try again." }, 429);
    const body = await req.json(); const sanitized = sanitizeInputs(body?.inputs); if (!sanitized.ok) return json(req, { error: sanitized.error }, sanitized.status);
    const selectedTemplate = resolveTemplate(sanitized.inputs); const research = await tavilyResearch(sanitized.inputs, selectedTemplate);
    const key = Deno.env.get("LOVABLE_API_KEY"); if (!key) throw new Error("AI service key missing");
    const systemPrompt = [
      "You are a senior feasibility consultant. Return only a professional consumer-facing feasibility report by calling provide_report.",
      "Never mention system diagnostics, templates, internal status, fallback, debug details, stack traces, or repair logic.",
      `Use this report type only: ${selectedTemplate.label}.`,
      `Must include sector terms: ${selectedTemplate.coreTerms.join(", ")}.`,
      `Must avoid wrong-template terms: ${selectedTemplate.bannedTerms.join(", ")}.`,
      `Use relevant competitors only from this business category: ${selectedTemplate.competitors.join(", ")}.`,
      `Use compliance path: ${selectedTemplate.compliance.join(", ")}.`,
      `Use risks: ${selectedTemplate.risks.join(", ")}.`,
      `Use GTM channels: ${selectedTemplate.gtmChannels.join(", ")}.`,
      `Recommendation rule: ${selectedTemplate.recommendationRule}`,
      "Scores must be 0-10. Financial scenarios must be exactly three: Optimistic, Base Case, Pessimistic.",
      "TAM must be greater than or equal to SAM, and SAM must be greater than or equal to SOM.",
      "Use the Tavily research citations when available and include them in research.citations."
    ].join("\n");
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(45000), body: JSON.stringify({ model: "google/gemini-3-flash-preview", messages: [{ role: "system", content: systemPrompt }, { role: "user", content: JSON.stringify({ inputs: sanitized.inputs, selectedTemplate, webResearch: research }) }], tools: [{ type: "function", function: { name: "provide_report", description: "Return the full feasibility report", parameters: reportSchema } }], tool_choice: { type: "function", function: { name: "provide_report" } } }) });
    if (!response.ok) { console.error("AI gateway failed", response.status); if (response.status === 429) return json(req, { error: "Rate limit exceeded. Try again shortly." }, 429); if (response.status === 402) return json(req, { error: "AI usage limit reached. Add credits to continue." }, 402); throw new Error("AI gateway unavailable"); }
    const data = await response.json(); const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments; if (!args) throw new Error("Invalid AI response");
    let report = stripBanned(JSON.parse(args) as Report, selectedTemplate) as Report;
    report.reportId = typeof report.reportId === "string" ? report.reportId : `FSB-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    report.dateIssued = typeof report.dateIssued === "string" ? report.dateIssued : new Date().toISOString().slice(0, 10);
    report.classification = "Confidential"; report.preparedBy = "Concept AI"; report.methodology = `FMART weighted feasibility scoring using ${selectedTemplate.label}.`;
    const reportResearch = getRecord(report.research, "research");
    if (research.citations.length > 0) { reportResearch.citations = research.citations; reportResearch.confidence = research.citations.length >= 5 ? "High" : "Medium"; reportResearch.overview = String(reportResearch.overview ?? research.answer ?? "External research supports market and competitor context."); report.research = reportResearch; }
    validateReport(report); return json(req, report);
  } catch (error) { console.error("analyze-concept-v2 failed", error); return json(req, { error: safePublicError() }, 500); }
});
