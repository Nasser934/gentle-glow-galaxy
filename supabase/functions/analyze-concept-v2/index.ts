import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";

const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? "https://gentle-glow-galaxy.lovable.app,http://localhost:8080")
  .split(",")
  .map((x) => x.trim())
  .filter(Boolean);

type Inputs = Record<string, string>;
type Report = Record<string, unknown>;
type Citation = { title: string; url: string; source: string; takeaway: string };
type ProfileRow = { label: string; value: string };
type WorkflowRow = { step: string; input: string; activity: string; output: string; control: string };
type UseCaseProfile = {
  reportTypeLabel: string;
  businessArchetype: string;
  useCase: string;
  buyer: string;
  users: string;
  jobToBeDone: string;
  workflowReplaced: string;
  monetizationLogic: string;
  marketFrame: string;
  complianceFrame: string;
  riskFrame: string;
  competitorFrame: string;
  gtmMotion: string;
  researchQueries: string[];
  likelyCompetitors: string[];
  keyRisks: string[];
  complianceNeeds: string[];
  forbiddenAssumptions: string[];
  workflowSteps: WorkflowRow[];
  architectureLayers: ProfileRow[];
  validationGates: ProfileRow[];
};

type FallbackTemplate = {
  label: string;
  searchQueries: string[];
  forbiddenAssumptions: string[];
  likelyCompetitors: string[];
  keyRisks: string[];
  complianceNeeds: string[];
};

const fallbackTemplates: Record<string, FallbackTemplate> = {
  healthcare_rpm: { label: "Healthcare / remote patient monitoring", searchQueries: ["remote patient monitoring market HIPAA EHR reimbursement"], forbiddenAssumptions: ["inter-agency", "GMV", "take rate", "anchor suppliers"], likelyCompetitors: ["Medtronic", "Philips", "Dexcom", "Abbott", "Epic"], keyRisks: ["HIPAA breach", "EHR integration delay", "patient adherence"], complianceNeeds: ["HIPAA", "FDA/SaMD", "SOC 2"] },
  public_sector_data_exchange: { label: "Public-sector data exchange", searchQueries: ["government data exchange platform FedRAMP procurement market"], forbiddenAssumptions: ["patient adherence", "GMV", "take rate", "portfolio alpha"], likelyCompetitors: ["Palantir", "Tyler Technologies", "IBM", "Oracle", "Microsoft Azure Government"], keyRisks: ["agency adoption", "legacy integration", "policy shift"], complianceNeeds: ["FedRAMP", "data-sharing agreements", "audit logs"] },
  identity_verification: { label: "Identity verification / security SaaS", searchQueries: ["digital identity verification market KYC AML Onfido Jumio Persona"], forbiddenAssumptions: ["portfolio alpha", "investment committee", "GMV", "take rate", "anchor suppliers"], likelyCompetitors: ["Onfido", "Jumio", "Persona", "ID.me", "Trulioo"], keyRisks: ["data breach", "false rejection", "regulatory change"], complianceNeeds: ["KYC/AML", "GDPR", "eIDAS", "SOC 2"] },
  enterprise_workflow: { label: "Enterprise workflow automation SaaS", searchQueries: ["enterprise workflow automation software market ServiceNow Monday Asana Jira"], forbiddenAssumptions: ["GMV", "take rate", "anchor suppliers", "supplier liquidity", "portfolio alpha"], likelyCompetitors: ["Monday.com", "Jira Service Management", "ServiceNow", "Asana", "Workato"], keyRisks: ["long enterprise sales cycle", "implementation burden", "low adoption"], complianceNeeds: ["SOC 2", "GDPR", "SSO", "RBAC", "audit logs"] },
  enterprise_data_insights: { label: "Enterprise data insights / BI analytics", searchQueries: ["business intelligence analytics platform market Power BI Tableau Looker"], forbiddenAssumptions: ["remote patient monitoring", "GMV", "take rate", "anchor suppliers"], likelyCompetitors: ["Power BI", "Tableau", "Looker", "Qlik", "ThoughtSpot"], keyRisks: ["poor data quality", "integration delays", "weak differentiation"], complianceNeeds: ["SOC 2", "ISO 27001", "SSO", "RBAC"] },
  customer_data_platform: { label: "Customer data platform", searchQueries: ["customer data platform CDP market Segment Salesforce Data Cloud Adobe"], forbiddenAssumptions: ["remote patient monitoring", "inter-agency", "GMV", "take rate"], likelyCompetitors: ["Twilio Segment", "Salesforce Data Cloud", "Adobe Real-Time CDP", "Tealium", "mParticle"], keyRisks: ["identity resolution failure", "poor data quality", "consent violation"], complianceNeeds: ["GDPR", "CCPA", "SOC 2", "consent management"] },
  marketplace: { label: "B2B marketplace / procurement platform", searchQueries: ["B2B procurement marketplace market Tradeling Moglix Amazon Business"], forbiddenAssumptions: ["workflow automation", "ERP/HRIS", "task assignment", "portfolio alpha"], likelyCompetitors: ["Tradeling", "Moglix", "Alibaba Business", "Amazon Business", "SAP Ariba"], keyRisks: ["cold start", "low liquidity", "CAC"], complianceNeeds: ["payments", "trust and safety", "tax invoicing"] },
  generic_saas: { label: "SaaS feasibility", searchQueries: ["SaaS market ACV CAC churn benchmarks"], forbiddenAssumptions: ["GMV", "take rate", "HIPAA", "FedRAMP", "portfolio alpha"], likelyCompetitors: ["Microsoft", "Google", "Salesforce", "Oracle", "Atlassian"], keyRisks: ["CAC inflation", "churn", "low conversion"], complianceNeeds: ["SOC 2", "privacy", "SSO", "RBAC"] }
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
function json(req: Request, body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }); }
function safePublicError() { return "Analysis service is temporarily unavailable. Please try again later."; }
function joinedInputs(inputs: Inputs) { return `${inputs.projectName} ${inputs.industry} ${inputs.location} ${inputs.description} ${inputs.strategicObjectives} ${inputs.businessModel} ${inputs.revenueModel} ${inputs.founderExperience} ${inputs.budgetRange} ${inputs.timeline} ${inputs.teamSize} ${inputs.dependencies} ${inputs.assumptions} ${inputs.constraints} ${inputs.successFactors} ${inputs.knownRisks} ${inputs.regulatoryConsiderations} ${inputs.technologyReadiness} ${inputs.competitorUrls}`.toLowerCase(); }
function fallbackTemplate(inputs: Inputs): FallbackTemplate {
  const t = joinedInputs(inputs);
  if (/remote patient|patient monitoring|\brpm\b|hospital|clinic|ehr|hipaa|healthcare|clinical/.test(t)) return fallbackTemplates.healthcare_rpm;
  if (/inter-agency|secure data exchange|government data|public sector|agency|fedramp|sovereign cloud|govtech/.test(t)) return fallbackTemplates.public_sector_data_exchange;
  if (/identity verification|digital identity|id verification|liveness|biometric|eidas|kyc|aml|fraud reduction/.test(t)) return fallbackTemplates.identity_verification;
  if (/customer data platform|\bcdp\b|customer 360|unified customer|identity resolution|first-party data/.test(t)) return fallbackTemplates.customer_data_platform;
  if (/workflow automation|enterprise workflow|task assignment|task tracking|cross-departmental|orchestration|erp\/hris|hris|approval workflow|work about work/.test(t)) return fallbackTemplates.enterprise_workflow;
  if (/data insights|business intelligence|\bbi platform\b|enterprise analytics|semantic layer|time-to-insight/.test(t)) return fallbackTemplates.enterprise_data_insights;
  if (/marketplace|b2b procurement platform|procurement marketplace|supplier marketplace|rfq platform|gmv|take rate/.test(t)) return fallbackTemplates.marketplace;
  return fallbackTemplates.generic_saas;
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
function stripForbidden(value: unknown, forbidden: string[]): unknown {
  if (typeof value === "string") return forbidden.reduce((out, term) => out.replace(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "sector-specific validation"), value);
  if (Array.isArray(value)) return value.map((v) => stripForbidden(v, forbidden));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, stripForbidden(v, forbidden)]));
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

const profileSchema = {
  type: "object",
  properties: {
    reportTypeLabel: { type: "string" }, businessArchetype: { type: "string" }, useCase: { type: "string" }, buyer: { type: "string" }, users: { type: "string" }, jobToBeDone: { type: "string" }, workflowReplaced: { type: "string" }, monetizationLogic: { type: "string" }, marketFrame: { type: "string" }, complianceFrame: { type: "string" }, riskFrame: { type: "string" }, competitorFrame: { type: "string" }, gtmMotion: { type: "string" },
    researchQueries: { type: "array", items: { type: "string" } }, likelyCompetitors: { type: "array", items: { type: "string" } }, keyRisks: { type: "array", items: { type: "string" } }, complianceNeeds: { type: "array", items: { type: "string" } }, forbiddenAssumptions: { type: "array", items: { type: "string" } },
    workflowSteps: { type: "array", items: { type: "object", properties: { step: { type: "string" }, input: { type: "string" }, activity: { type: "string" }, output: { type: "string" }, control: { type: "string" } }, required: ["step", "input", "activity", "output", "control"] } },
    architectureLayers: { type: "array", items: { type: "object", properties: { label: { type: "string" }, value: { type: "string" } }, required: ["label", "value"] } },
    validationGates: { type: "array", items: { type: "object", properties: { label: { type: "string" }, value: { type: "string" } }, required: ["label", "value"] } }
  },
  required: ["reportTypeLabel", "businessArchetype", "useCase", "buyer", "users", "jobToBeDone", "workflowReplaced", "monetizationLogic", "marketFrame", "complianceFrame", "riskFrame", "competitorFrame", "gtmMotion", "researchQueries", "likelyCompetitors", "keyRisks", "complianceNeeds", "forbiddenAssumptions", "workflowSteps", "architectureLayers", "validationGates"]
};

function fallbackProfile(inputs: Inputs, fallback: FallbackTemplate): UseCaseProfile {
  return {
    reportTypeLabel: fallback.label,
    businessArchetype: inputs.businessModel || "SaaS / platform business",
    useCase: inputs.description || inputs.projectName,
    buyer: "Target buyer defined by the submitted business concept",
    users: "Primary end users defined by the submitted workflow",
    jobToBeDone: inputs.strategicObjectives || "Solve the core operational problem described in the concept",
    workflowReplaced: "Current manual or fragmented workflow",
    monetizationLogic: inputs.revenueModel || "Revenue model to be validated",
    marketFrame: fallback.searchQueries[0] || inputs.industry,
    complianceFrame: fallback.complianceNeeds.join(", "),
    riskFrame: fallback.keyRisks.join(", "),
    competitorFrame: fallback.likelyCompetitors.join(", "),
    gtmMotion: "Paid pilots followed by staged expansion",
    researchQueries: fallback.searchQueries,
    likelyCompetitors: fallback.likelyCompetitors,
    keyRisks: fallback.keyRisks,
    complianceNeeds: fallback.complianceNeeds,
    forbiddenAssumptions: fallback.forbiddenAssumptions,
    workflowSteps: [
      { step: "1", input: "Target customer need", activity: "Capture and qualify the use case", output: "Validated problem statement", control: "Buyer fit check" },
      { step: "2", input: "Workflow and data inputs", activity: "Run the proposed product workflow", output: "Measurable business result", control: "Operational control point" },
      { step: "3", input: "Usage and financial data", activity: "Measure adoption and economics", output: "Scale decision", control: "Validation gate" }
    ],
    architectureLayers: [{ label: "Experience layer", value: "User workflow and buyer journey." }, { label: "Application layer", value: "Core product logic and workflow controls." }, { label: "Data and security layer", value: "Reporting, access control, auditability and privacy." }],
    validationGates: [{ label: "Buyer proof", value: "Validate buyer urgency and willingness to pay." }, { label: "Financial proof", value: "Validate ACV, CAC, margin and payback." }, { label: "Execution proof", value: "Validate team, technology and operating readiness." }]
  };
}

async function inferUseCaseProfile(key: string, inputs: Inputs, fallback: FallbackTemplate): Promise<UseCaseProfile> {
  try {
    const prompt = [
      "Infer the exact business use case from the submitted concept. Do not force the concept into a predefined category.",
      "Return the business situation, buyer, user, job-to-be-done, workflow replaced, monetization logic, market frame, compliance frame, risk frame, competitor frame, GTM motion, useful web research queries, and forbidden assumptions.",
      "The forbidden assumptions must list phrases or logic that would be wrong for this exact concept. Example: for workflow SaaS, forbid GMV, supplier liquidity, take rate, anchor suppliers. For marketplace, forbid workflow-only SaaS assumptions.",
      "Use the fallback hints only if they match the submitted concept. If the fallback conflicts with the concept, ignore the fallback."
    ].join("\n");
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(20000),
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: prompt }, { role: "user", content: JSON.stringify({ inputs, fallbackHints: fallback }) }],
        tools: [{ type: "function", function: { name: "provide_use_case_profile", description: "Return the inferred use-case profile", parameters: profileSchema } }],
        tool_choice: { type: "function", function: { name: "provide_use_case_profile" } }
      })
    });
    if (!response.ok) throw new Error("profile inference failed");
    const data = await response.json(); const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("profile inference returned no args");
    const profile = JSON.parse(args) as UseCaseProfile;
    if (!profile.reportTypeLabel || !Array.isArray(profile.workflowSteps) || profile.workflowSteps.length < 3) throw new Error("profile incomplete");
    return profile;
  } catch {
    return fallbackProfile(inputs, fallback);
  }
}

async function tavilyResearch(inputs: Inputs, profile: UseCaseProfile): Promise<{ answer: string; citations: Citation[] }> {
  const key = Deno.env.get("TAVILY_API_KEY"); if (!key) return { answer: "", citations: [] };
  const query = [inputs.projectName, inputs.location, profile.researchQueries?.[0] || profile.marketFrame].filter(Boolean).join(" ").slice(0, 390);
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

const reportSchema = { type: "object", properties: { useCaseProfile: profileSchema, executiveSummary: { type: "string" }, scores: { type: "object" }, market: { type: "object" }, customer: { type: "object" }, competitors: { type: "array", items: { type: "object" } }, research: { type: "object" }, financials: { type: "object" }, risks: { type: "array", items: { type: "object" } }, fundingMix: { type: "array", items: { type: "object" } }, fundingAdvisory: { type: "string" }, recommendations: { type: "array", items: { type: "string" } }, nextSteps: { type: "array", items: { type: "string" } }, implementationRoadmap: { type: "object" } }, required: ["useCaseProfile", "executiveSummary", "scores", "market", "customer", "competitors", "research", "financials", "risks", "fundingMix", "fundingAdvisory", "recommendations", "nextSteps"] };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  try {
    const authHeader = req.headers.get("Authorization"); if (!authHeader?.startsWith("Bearer ")) return json(req, { error: "Please sign in to run an analysis." }, 401);
    const auth = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userError } = await auth.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userError || !userData?.user?.id) return json(req, { error: "Your session has expired. Please sign in again." }, 401);
    const limit = await checkRateLimit(userData.user.id); if (!limit.ok) return json(req, { error: "Too many requests. Please wait and try again." }, 429);
    const body = await req.json(); const sanitized = sanitizeInputs(body?.inputs); if (!sanitized.ok) return json(req, { error: sanitized.error }, sanitized.status);
    const key = Deno.env.get("LOVABLE_API_KEY"); if (!key) throw new Error("AI service key missing");

    const fallback = fallbackTemplate(sanitized.inputs);
    const profile = await inferUseCaseProfile(key, sanitized.inputs, fallback);
    const research = await tavilyResearch(sanitized.inputs, profile);
    const forbidden = Array.from(new Set([...(profile.forbiddenAssumptions || []), ...fallback.forbiddenAssumptions])).filter(Boolean);

    const systemPrompt = [
      "You are a senior feasibility consultant. Return only a professional consumer-facing feasibility report by calling provide_report.",
      "Use the AI-inferred useCaseProfile as the source of truth. Do not force the report into a fixed category.",
      "Never mention system diagnostics, templates, internal status, fallback, debug details, stack traces, or repair logic.",
      "Build the report from the business situation, buyer, user, job-to-be-done, workflow replaced, monetization logic, competitors, compliance context, risks, and validation gates in useCaseProfile.",
      "The reportTypeLabel must be the useCaseProfile.reportTypeLabel, not a hard-coded category.",
      `Forbidden assumptions and terms for this concept: ${forbidden.join(", ")}.`,
      "Do not include any workflow, competitor, revenue logic, risks, or diagrams that conflict with the useCaseProfile.",
      "Scores must be 0-10. Financial scenarios must be exactly three: Optimistic, Base Case, Pessimistic.",
      "TAM must be greater than or equal to SAM, and SAM must be greater than or equal to SOM.",
      "Use Tavily research citations when available and include them in research.citations. If no citations are available, set research.confidence to Low and state that primary research is required."
    ].join("\n");
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(45000), body: JSON.stringify({ model: "google/gemini-3-flash-preview", messages: [{ role: "system", content: systemPrompt }, { role: "user", content: JSON.stringify({ inputs: sanitized.inputs, useCaseProfile: profile, webResearch: research }) }], tools: [{ type: "function", function: { name: "provide_report", description: "Return the full feasibility report", parameters: reportSchema } }], tool_choice: { type: "function", function: { name: "provide_report" } } }) });
    if (!response.ok) { console.error("AI gateway failed", response.status); if (response.status === 429) return json(req, { error: "Rate limit exceeded. Try again shortly." }, 429); if (response.status === 402) return json(req, { error: "AI usage limit reached. Add credits to continue." }, 402); throw new Error("AI gateway unavailable"); }
    const data = await response.json(); const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments; if (!args) throw new Error("Invalid AI response");
    let report = stripForbidden(JSON.parse(args) as Report, forbidden) as Report;
    report.useCaseProfile = profile;
    report.reportId = typeof report.reportId === "string" ? report.reportId : `FSB-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    report.dateIssued = typeof report.dateIssued === "string" ? report.dateIssued : new Date().toISOString().slice(0, 10);
    report.classification = "Confidential"; report.preparedBy = "Concept AI"; report.methodology = `FMART weighted feasibility scoring using an AI-inferred use-case profile: ${profile.reportTypeLabel}.`;
    const reportResearch = getRecord(report.research, "research");
    if (research.citations.length > 0) { reportResearch.citations = research.citations; reportResearch.confidence = research.citations.length >= 5 ? "High" : "Medium"; reportResearch.overview = String(reportResearch.overview ?? research.answer ?? "External research supports market and competitor context."); report.research = reportResearch; }
    validateReport(report); return json(req, report);
  } catch (error) { console.error("analyze-concept-v2 failed", error); return json(req, { error: safePublicError() }, 500); }
});
