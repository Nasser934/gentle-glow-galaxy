import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { deepSanitize } from "../_shared/sanitize.ts";
import { pseudonymousIpHash } from "../_shared/rateLimit.ts";
import { buildCanonicalReport } from "../_shared/analysis/canonical.ts";
import { validateConceptInputs, validateInputOrigins } from "../_shared/analysis/input.ts";
import { fetchPublicResearch } from "../_shared/analysis/publicResearch.ts";
import { buildBaseReportFromSeed, REPORT_SEED_SCHEMA } from "../_shared/analysis/reportSeed.ts";
import {
  compactResearchContext,
  GatewayAttemptError,
  requestStructuredReport,
  safeGatewayUserError,
} from "../_shared/analysis/gateway.ts";

const DEFAULT_ALLOWED_ORIGINS = [
  "https://gentle-glow-galaxy.lovable.app",
  "http://localhost:5173",
  "http://localhost:8080",
];
const REPORT_MODEL_ID = "google/gemini-3.5-flash";
const PROMPT_VERSION = "concept-ai-2026-07-19.3";

function allowedOrigins() {
  const configured = (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...configured]);
}

function buildCorsHeaders(req: Request) {
  const origin = req.headers.get("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, idempotency-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  if (origin && allowedOrigins().has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

const textFrom = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeUsageMetadata(raw: unknown) {
  if (!raw || typeof raw !== "object") return {};
  const usage = raw as Record<string, unknown>;
  const allowed = ["prompt_tokens", "completion_tokens", "total_tokens"];
  return Object.fromEntries(allowed.flatMap((key) => {
    const value = Number(usage[key]);
    return Number.isFinite(value) && value >= 0 ? [[key, value]] : [];
  }));
}

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  corsHeaders: Record<string, string>,
  extraHeaders: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      ...extraHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const origin = req.headers.get("origin");
  if (origin && !corsHeaders["Access-Control-Allow-Origin"]) {
    return jsonResponse({ error: "Origin is not allowed.", errorCode: "origin_not_allowed" }, 403, {});
  }
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed.", errorCode: "method_not_allowed" }, 405, corsHeaders);
  }

  let requestId: string | null = null;
  let requestClient: ReturnType<typeof createClient> | null = null;
  let modelIdForLog: string | null = null;
  let researchStatus = "not_requested";
  let failureCategory = "internal_error";

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Please sign in to run an analysis.", errorCode: "authentication_required" }, 401, corsHeaders);
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    requestClient = supabaseAuth;

    let userId: string | undefined;
    try {
      const { data: claimsData } = await supabaseAuth.auth.getClaims(token);
      userId = claimsData?.claims?.sub as string | undefined;
    } catch {
      // Fall through to the network-backed validation below.
    }
    if (!userId) {
      const { data: userData, error: userError } = await supabaseAuth.auth.getUser(token);
      if (userError || !userData?.user?.id) {
        console.warn(JSON.stringify({ event: "analysis_auth_failed", reason: userError?.message ?? "missing_user" }));
        return jsonResponse({ error: "Your session has expired. Please sign in again.", errorCode: "session_expired" }, 401, corsHeaders);
      }
      userId = userData.user.id;
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON request.", errorCode: "invalid_json" }, 400, corsHeaders);
    }

    const validated = validateConceptInputs(body.inputs ?? {});
    if (!validated.success) {
      return jsonResponse({
        error: "The concept brief needs correction before analysis.",
        errorCode: "invalid_concept_brief",
        issues: validated.issues.map((issue) => ({ code: issue.code, field: issue.field, message: issue.message })),
      }, 400, corsHeaders);
    }

    const inputs: Record<string, string> = {
      ...validated.data,
      competitorUrls: validated.data.competitorUrls.join("\n"),
    };
    const inputOrigins = validateInputOrigins(body.inputOrigins);
    const orderedInputOrigins = Object.fromEntries(
      Object.entries(inputOrigins).sort(([left], [right]) => left.localeCompare(right)),
    );
    const inputHash = await sha256(JSON.stringify({ inputs, inputOrigins: orderedInputOrigins }));
    const suppliedIdempotencyKey = textFrom(req.headers.get("idempotency-key") || body.idempotencyKey).trim();
    const idempotencyKey = /^[A-Za-z0-9._:-]{16,128}$/.test(suppliedIdempotencyKey)
      ? suppliedIdempotencyKey
      : `legacy-${inputHash.slice(0, 40)}-${Math.floor(Date.now() / 60_000)}`;

    const ipHash = await pseudonymousIpHash(req);
    const { data: requestRows, error: requestError } = await supabaseAuth.rpc("begin_analysis_request", {
      p_function_name: "analyze-concept",
      p_idempotency_key: idempotencyKey,
      p_request_hash: `sha256:${inputHash}`,
      p_ip_hash: ipHash,
    });
    if (requestError || !requestRows?.length) {
      console.error(JSON.stringify({ event: "analysis_usage_control_unavailable", category: "persistent_rate_limit" }));
      return jsonResponse(
        { error: "Analysis is temporarily unavailable. Please try again shortly.", errorCode: "usage_control_unavailable" },
        503,
        corsHeaders,
        { "Retry-After": "60" },
      );
    }

    const requestDecision = requestRows[0] as {
      request_id: string | null;
      allowed: boolean;
      reason: string;
      retry_after_seconds: number;
    };
    requestId = requestDecision.request_id;
    if (!requestDecision.allowed) {
      const duplicate = requestDecision.reason === "duplicate_request";
      return jsonResponse({
        error: duplicate ? "This analysis request is already running or completed." : "Usage limit reached. Please try again later.",
        errorCode: duplicate ? "duplicate_request" : "usage_limit_reached",
        requestId,
      }, duplicate ? 409 : 429, corsHeaders, {
        "Retry-After": String(requestDecision.retry_after_seconds || (duplicate ? 15 : 60)),
      });
    }

    console.info(JSON.stringify({
      event: "analysis_request_started",
      requestId,
      function: "analyze-concept",
      userIdHash: await sha256(userId).then((value) => value.slice(0, 12)),
      promptVersion: PROMPT_VERSION,
    }));

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      failureCategory = "configuration";
      throw new Error("AI service is not configured");
    }

    const publicResearch = await fetchPublicResearch(inputs);
    researchStatus = publicResearch.coverage === "Sufficient" || publicResearch.coverage === "Partial"
      ? "complete"
      : publicResearch.coverage === "Limited"
        ? "partial"
        : "failed";
    console.info(JSON.stringify({
      event: "research_completed",
      requestId,
      status: researchStatus,
      sourceCount: publicResearch.citations.length,
      reliableSourceCount: publicResearch.coverageMetrics.reliableSourceCount,
    }));

    const systemPrompt = `You are Concept AI's evidence-aware feasibility analyst using FMART-O: Financial, Market, Achievability, Risk, Timing, and Operational.
Call the provide_report tool once and return only the concise report seed requested by its schema.
The server will calculate the authoritative overall score, verdict, weights, CapEx totals, annual OpEx, investment range, evidence composition, input completeness, growth chart, and detailed score-explanation rows. Do not duplicate those calculations.
Use concise text so the complete structured response finishes within the output limit.
Use full currency-unit numbers, never abbreviations such as 12B.
Use zero for an unsupported market or financial figure, and clearly say it requires validation in the related note or basis.
Use exact source IDs only when the supplied source directly supports the claim. Otherwise use no source ID and mark the claim as AI inference or user input.
Community discussions are directional signals. Competitor pages are company claims. General references do not verify financial figures.
Choose internal projectType only for cost avoidance, productivity, or avoided spend; otherwise choose commercial.
Use consumer-safe language. Never mention debugging, fallbacks, raw errors, test failures, or internal implementation details.`;

    const userPrompt = `Create a concise feasibility-report seed for this concept.

Project: ${inputs.projectName}
Industry: ${inputs.industry}
Location: ${inputs.location || "Not specified"}
Description: ${inputs.description}
Strategic objectives: ${inputs.strategicObjectives || "Not specified"}
Business model: ${inputs.businessModel || "Not specified"}
Revenue or value model: ${inputs.revenueModel || "Not specified"}
Team experience: ${inputs.founderExperience || "Not specified"}
Budget range: ${inputs.budgetRange || "Not specified"}
Timeline: ${inputs.timeline || "Not specified"}
Team size: ${inputs.teamSize || "Not specified"}
Dependencies: ${inputs.dependencies || "None"}
Assumptions: ${inputs.assumptions || "None"}
Constraints: ${inputs.constraints || "None"}
Success factors: ${inputs.successFactors || "Not specified"}
Known risks: ${inputs.knownRisks || "None"}
Regulatory considerations: ${inputs.regulatoryConsiderations || "None"}
Technology readiness: ${inputs.technologyReadiness || "Not specified"}
Competitor URLs: ${inputs.competitorUrls || "None"}

Bounded research context:
${JSON.stringify(compactResearchContext(publicResearch))}

Keep the executive summary below 900 characters. Keep each finding and rationale concise. Return exactly 3 competitors, 5 risks, 3 funding sources, 3 scenarios, 5 recommendations, 4 next steps, and no more than 4 evidence claims.`;

    modelIdForLog = REPORT_MODEL_ID;
    failureCategory = "ai_request";
    const aiResult = await requestStructuredReport({
      apiKey,
      modelId: REPORT_MODEL_ID,
      systemPrompt,
      userPrompt,
      schema: REPORT_SEED_SCHEMA,
      timeoutMs: 80_000,
      requestId,
      attempt: 1,
    });

    failureCategory = "canonical_validation";
    const expanded = buildBaseReportFromSeed({
      seed: aiResult.parsed,
      inputs,
      publicResearch,
      inputIssues: validated.issues,
    }) as Record<string, unknown>;
    const expandedResearch = typeof expanded.research === "object" && expanded.research !== null
      ? expanded.research as Record<string, unknown>
      : {};
    const baseReport = {
      reportId: `CAI-${new Date().getUTCFullYear()}-${crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`,
      dateIssued: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      classification: "Confidential",
      preparedBy: "Concept AI",
      methodology: "FMART-O 6-Dimension Weighted Scoring",
      ...expanded,
      research: {
        ...expandedResearch,
        citations: publicResearch.citations,
        coverage: publicResearch.coverage,
        coverageMethod: "Source quality, recency, direct claim support, and independent domains.",
        coverageMetrics: publicResearch.coverageMetrics,
      },
    };

    const generationTimestamp = new Date().toISOString();
    const canonical = buildCanonicalReport(baseReport, inputs, {
      modelId: REPORT_MODEL_ID,
      promptVersion: PROMPT_VERSION,
      inputHash: `sha256:${inputHash}`,
      generationTimestamp,
      researchTimestamp: publicResearch.generatedAt,
      inputOrigins,
      serverInputClassification: validated.classification,
      inputWarningCodes: validated.issues.map((issue) => issue.code),
    });
    const report = deepSanitize(canonical);

    if (report.scoringAudit?.difference !== null && Math.abs(report.scoringAudit.difference) > 0.01) {
      console.warn(JSON.stringify({
        event: "score_mismatch",
        requestId,
        difference: report.scoringAudit.difference,
        scoringEngineVersion: report.scoringAudit.scoringEngineVersion,
      }));
    }
    if (report.qualityMetadata?.financialWarningCount > 0) {
      console.warn(JSON.stringify({
        event: "financial_validation_warning",
        requestId,
        warningCount: report.qualityMetadata.financialWarningCount,
      }));
    }

    const { data: completionAccepted, error: completionError } = requestId
      ? await supabaseAuth.rpc("complete_analysis_request", {
          p_request_id: requestId,
          p_completion_status: "completed",
          p_model_id: REPORT_MODEL_ID,
          p_prompt_version: PROMPT_VERSION,
          p_usage_metadata: safeUsageMetadata(aiResult.data.usage),
          p_research_status: researchStatus,
          p_failure_category: null,
        })
      : { data: true, error: null };
    if (completionError || completionAccepted !== true) {
      failureCategory = "usage_logging";
      console.error(JSON.stringify({ event: "analysis_completion_log_failed", requestId }));
      throw new Error("Analysis completion could not be recorded");
    }

    console.info(JSON.stringify({
      event: "analysis_completed",
      requestId,
      model: REPORT_MODEL_ID,
      promptVersion: PROMPT_VERSION,
      finishReason: aiResult.finishReason,
      responseSource: aiResult.responseSource,
      validationStatus: report.validationStatus,
      sourceCount: report.qualityMetadata?.sourceCount ?? 0,
      unsupportedClaimCount: report.qualityMetadata?.unsupportedClaimCount ?? 0,
    }));
    requestId = null;

    return jsonResponse(report as Record<string, unknown>, 200, corsHeaders);
  } catch (error) {
    const gatewayError = error instanceof GatewayAttemptError ? error : null;
    if (gatewayError) failureCategory = gatewayError.category;
    else if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")) failureCategory = "ai_timeout";

    if (requestId && requestClient) {
      try {
        await requestClient.rpc("complete_analysis_request", {
          p_request_id: requestId,
          p_completion_status: "failed",
          p_model_id: modelIdForLog,
          p_prompt_version: PROMPT_VERSION,
          p_usage_metadata: {},
          p_research_status: researchStatus,
          p_failure_category: failureCategory,
        });
      } catch {
        console.warn(JSON.stringify({ event: "analysis_failure_log_failed", requestId }));
      }
    }

    const safeError = gatewayError
      ? safeGatewayUserError(gatewayError)
      : failureCategory === "ai_timeout"
        ? { status: 504, message: "The report took too long to complete. No report was saved." }
        : failureCategory === "canonical_validation"
          ? { status: 502, message: "The generated report could not pass validation. No report was saved." }
          : { status: 500, message: "Analysis failed unexpectedly. No report was saved." };
    console.error(JSON.stringify({
      event: "analysis_failed",
      requestId,
      category: failureCategory,
      errorName: error instanceof Error ? error.name : "unknown",
    }));
    return jsonResponse({
      error: safeError.message,
      errorCode: failureCategory,
      requestId,
    }, safeError.status, corsHeaders);
  }
});
