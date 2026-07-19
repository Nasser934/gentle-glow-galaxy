import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { deepSanitize } from "../_shared/sanitize.ts";
import { pseudonymousIpHash } from "../_shared/rateLimit.ts";
import { buildCanonicalReport } from "../_shared/analysis/canonical.ts";
import { validateConceptInputs, validateInputOrigins } from "../_shared/analysis/input.ts";
import { fetchPublicResearch } from "../_shared/analysis/publicResearch.ts";
import { buildBaseReportFromSeed, REPORT_SEED_SCHEMA } from "../_shared/analysis/reportSeed.ts";
import { buildResilientReportSeed } from "../_shared/analysis/resilientSeed.ts";
import {
  compactResearchContext,
  GatewayAttemptError,
  requestStructuredReport,
} from "../_shared/analysis/gateway.ts";

const DEFAULT_ALLOWED_ORIGINS = [
  "https://gentle-glow-galaxy.lovable.app",
  "http://localhost:5173",
  "http://localhost:8080",
];
const REPORT_MODEL_ID = "google/gemini-3.5-flash";
const PROMPT_VERSION = "concept-ai-2026-07-19.5-resilient";
const MODEL_TIMEOUT_MS = 125_000;

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
    "Access-Control-Expose-Headers": "x-concept-ai-version, x-analysis-request-id, x-analysis-mode",
    "Vary": "Origin",
  };
  if (origin && allowedOrigins().has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
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
      "x-concept-ai-version": PROMPT_VERSION,
    },
  });
}

const textFrom = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeUsageMetadata(raw: unknown) {
  if (!raw || typeof raw !== "object") return {};
  const usage = raw as Record<string, unknown>;
  return Object.fromEntries(["prompt_tokens", "completion_tokens", "total_tokens"].flatMap((key) => {
    const value = Number(usage[key]);
    return Number.isFinite(value) && value >= 0 ? [[key, value]] : [];
  }));
}

function gatewayReason(error: unknown) {
  if (error instanceof GatewayAttemptError) return error.category;
  if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")) return "ai_timeout";
  return "ai_unavailable";
}

function warningMessage(code: string) {
  if (code.startsWith("generation_")) {
    return "The narrative AI response was unavailable or incomplete. Missing sections were completed using user inputs and deterministic calculations; unsupported assumptions require validation.";
  }
  if (code === "limited_external_evidence") {
    return "External evidence coverage is limited. The report remains available, but unsupported claims and figures must be validated before commitment.";
  }
  return "Input detail or supporting evidence requires validation before commitment.";
}

function applyGenerationNotice(
  canonical: Record<string, unknown>,
  usedFallback: boolean,
  degradedReason: string | null,
) {
  canonical.generationMode = usedFallback ? "deterministic_fallback" : "ai_assisted";
  canonical.generationNotice = usedFallback
    ? "A complete report was produced from user inputs, deterministic FMART-O calculations, and available research because the AI narrative response was incomplete or unavailable. Review all validation warnings before using the report for a commitment."
    : "AI-assisted narrative with deterministic calculations and evidence validation.";

  if (!usedFallback) return;
  canonical.validationStatus = "valid_with_warnings";
  const warnings = Array.isArray(canonical.validationWarnings)
    ? canonical.validationWarnings.map((raw) => {
        const warning = asRecord(raw);
        const code = textFrom(warning.code, "generation_fallback");
        return { ...warning, code, message: warningMessage(code) };
      })
    : [];
  if (!warnings.some((warning) => textFrom(warning.code).startsWith("generation_"))) {
    const code = `generation_${degradedReason || "fallback"}`.replace(/[^a-z0-9_]+/gi, "_").toLowerCase();
    warnings.push({ code, message: warningMessage(code), path: "generation" });
  }
  canonical.validationWarnings = warnings;

  const quality = asRecord(canonical.qualityMetadata);
  canonical.qualityMetadata = {
    ...quality,
    validationStatus: "valid_with_warnings",
    validationWarnings: warnings.map((warning) => textFrom(warning.code)).filter(Boolean),
  };
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

  const functionStartedAt = Date.now();
  let requestId: string | null = null;
  let requestClient: ReturnType<typeof createClient> | null = null;
  let researchStatus = "not_requested";
  let degradedReason: string | null = null;
  let aiUsage: unknown = {};
  let finishReason: string | null = null;
  let responseSource = "deterministic_fallback";

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
      // Fall through to network-backed validation.
    }
    if (!userId) {
      const { data: userData, error: userError } = await supabaseAuth.auth.getUser(token);
      if (userError || !userData?.user?.id) {
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

    let shouldCallAi = true;
    try {
      const ipHash = await pseudonymousIpHash(req);
      const { data: requestRows, error: requestError } = await supabaseAuth.rpc("begin_analysis_request", {
        p_function_name: "analyze-concept",
        p_idempotency_key: idempotencyKey,
        p_request_hash: `sha256:${inputHash}`,
        p_ip_hash: ipHash,
      });
      if (requestError || !requestRows?.length) {
        degradedReason = "usage_control_unavailable";
        console.warn(JSON.stringify({ event: "analysis_usage_control_advisory", reason: degradedReason }));
      } else {
        const decision = requestRows[0] as {
          request_id: string | null;
          allowed: boolean;
          reason: string;
        };
        requestId = decision.request_id;
        if (!decision.allowed) {
          shouldCallAi = false;
          degradedReason = decision.reason === "duplicate_request" ? "duplicate_request" : "usage_limit";
          console.warn(JSON.stringify({ event: "analysis_ai_skipped", requestId, reason: degradedReason }));
        }
      }
    } catch (error) {
      degradedReason = "usage_control_unavailable";
      console.warn(JSON.stringify({
        event: "analysis_usage_control_advisory",
        reason: degradedReason,
        errorName: error instanceof Error ? error.name : "unknown",
      }));
    }

    const publicResearch = await fetchPublicResearch(inputs);
    researchStatus = publicResearch.coverage === "Sufficient" || publicResearch.coverage === "Partial"
      ? "complete"
      : publicResearch.coverage === "Limited"
        ? "partial"
        : "failed";

    const systemPrompt = `You are Concept AI's evidence-aware feasibility analyst using FMART-O: Financial, Market, Achievability, Risk, Timing, and Operational.
Call the provide_report tool exactly once and return the complete concise report seed required by the schema.
The server calculates the authoritative score, verdict, weights, totals, investment range, evidence composition, input completeness, charts, and score explanations.
Use full currency-unit numbers. Use zero for unsupported figures and clearly state that they require validation. Never invent a citation or source ID.`;

    const userPrompt = `Create a complete feasibility-report seed for this concept.
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
Research context: ${JSON.stringify(compactResearchContext(publicResearch))}
Keep the executive summary below 900 characters. Return exactly 3 competitors, 5 risks, 3 funding sources, 3 scenarios, 5 recommendations, 4 next steps, and no more than 4 evidence claims.`;

    let aiSeed: Record<string, unknown> | null = null;
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      shouldCallAi = false;
      degradedReason ||= "ai_not_configured";
    }

    if (shouldCallAi && apiKey) {
      try {
        const aiResult = await requestStructuredReport({
          apiKey,
          modelId: REPORT_MODEL_ID,
          systemPrompt,
          userPrompt,
          schema: REPORT_SEED_SCHEMA,
          timeoutMs: MODEL_TIMEOUT_MS,
          requestId,
          attempt: 1,
        });
        aiSeed = aiResult.parsed;
        aiUsage = aiResult.data.usage;
        finishReason = aiResult.finishReason;
        responseSource = aiResult.responseSource;
      } catch (error) {
        degradedReason = gatewayReason(error);
        console.warn(JSON.stringify({
          event: "analysis_ai_degraded_to_deterministic_report",
          requestId,
          reason: degradedReason,
          elapsedMs: Date.now() - functionStartedAt,
        }));
      }
    }

    const resilientSeed = buildResilientReportSeed({
      inputs,
      publicResearch,
      aiSeed,
      degradedReason,
    });
    const expanded = buildBaseReportFromSeed({
      seed: resilientSeed.seed,
      inputs,
      publicResearch,
      inputIssues: validated.issues,
    }) as Record<string, unknown>;
    const expandedResearch = asRecord(expanded.research);
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
    const warningCodes = [
      ...validated.issues.map((issue) => issue.code),
      ...(resilientSeed.warningCode ? [resilientSeed.warningCode] : []),
      ...(publicResearch.reliableExternalEvidence ? [] : ["limited_external_evidence"]),
    ];
    const canonical = buildCanonicalReport(baseReport, inputs, {
      modelId: REPORT_MODEL_ID,
      promptVersion: PROMPT_VERSION,
      inputHash: `sha256:${inputHash}`,
      generationTimestamp,
      researchTimestamp: publicResearch.generatedAt,
      inputOrigins,
      serverInputClassification: validated.classification,
      inputWarningCodes: [...new Set(warningCodes)],
    }) as unknown as Record<string, unknown>;
    applyGenerationNotice(canonical, resilientSeed.usedFallback, degradedReason);
    const report = deepSanitize(canonical) as Record<string, unknown>;

    if (requestId && requestClient) {
      try {
        const { error: completionError } = await requestClient.rpc("complete_analysis_request", {
          p_request_id: requestId,
          p_completion_status: "completed",
          p_model_id: REPORT_MODEL_ID,
          p_prompt_version: PROMPT_VERSION,
          p_usage_metadata: safeUsageMetadata(aiUsage),
          p_research_status: researchStatus,
          p_failure_category: degradedReason,
        });
        if (completionError) console.warn(JSON.stringify({ event: "analysis_completion_log_skipped", requestId }));
      } catch {
        console.warn(JSON.stringify({ event: "analysis_completion_log_skipped", requestId }));
      }
    }

    console.info(JSON.stringify({
      event: "analysis_completed",
      requestId,
      elapsedMs: Date.now() - functionStartedAt,
      mode: resilientSeed.usedFallback ? "deterministic_fallback" : "ai_assisted",
      degradedReason,
      finishReason,
      responseSource,
      validationStatus: report.validationStatus,
    }));

    return jsonResponse(report, 200, corsHeaders, {
      "x-analysis-request-id": requestId ?? "not-recorded",
      "x-analysis-mode": resilientSeed.usedFallback ? "deterministic-fallback" : "ai-assisted",
    });
  } catch (error) {
    console.error(JSON.stringify({
      event: "analysis_failed_unexpectedly",
      requestId,
      elapsedMs: Date.now() - functionStartedAt,
      errorName: error instanceof Error ? error.name : "unknown",
    }));
    return jsonResponse({
      error: "The report could not be assembled because of an unexpected internal error. Your inputs were not lost; retry once.",
      errorCode: "internal_report_assembly_error",
      requestId,
    }, 500, corsHeaders);
  }
});
