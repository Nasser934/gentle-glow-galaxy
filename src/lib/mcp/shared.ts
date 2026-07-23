import { createClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";

export function sbClient(ctx: ToolContext) {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY!;
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function err(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true as const };
}

export function ok(text: string, structured?: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text }],
    structuredContent: structured,
  };
}

// Max serialized payload size for external analysis submissions (~256 KB).
export const MAX_PAYLOAD_BYTES = 256 * 1024;

/**
 * Concept AI External Analysis JSON schema (public contract for MCP callers).
 * Kept lightweight — Concept AI still owns authoritative scoring and financial
 * totals; external agents propose, Concept AI validates & recomputes.
 */
export const EXTERNAL_ANALYSIS_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "ConceptAIExternalAnalysis",
  type: "object",
  required: ["title", "industry", "inputs", "analysis"],
  properties: {
    title: { type: "string", minLength: 3, maxLength: 200 },
    industry: {
      type: "string",
      enum: ["pmo", "it", "telecom", "infrastructure", "government", "real_estate", "other"],
    },
    inputs: {
      type: "object",
      description: "Project brief: overview, scope, assumptions, risks, financials.",
      properties: {
        overview: { type: "string" },
        scope: { type: "string" },
        assumptions: { type: "array", items: { type: "string" } },
        risks: { type: "array", items: { type: "string" } },
        budget: { type: ["number", "string"] },
        timeline: { type: "string" },
        region: { type: "string" },
      },
      additionalProperties: true,
    },
    analysis: {
      type: "object",
      required: ["fmarto", "verdict"],
      properties: {
        fmarto: {
          type: "object",
          description: "Proposed FMART-O scores. Concept AI recomputes canonical values.",
          properties: {
            feasibility: { type: "number", minimum: 0, maximum: 100 },
            market: { type: "number", minimum: 0, maximum: 100 },
            architecture: { type: "number", minimum: 0, maximum: 100 },
            risk: { type: "number", minimum: 0, maximum: 100 },
            timeline: { type: "number", minimum: 0, maximum: 100 },
            operations: { type: "number", minimum: 0, maximum: 100 },
            rationale: { type: "object", additionalProperties: { type: "string" } },
          },
        },
        verdict: {
          type: "object",
          required: ["recommendation"],
          properties: {
            recommendation: {
              type: "string",
              enum: ["proceed", "proceed_with_caution", "revise", "do_not_proceed"],
            },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            summary: { type: "string", maxLength: 2000 },
          },
        },
        market: {
          type: "object",
          properties: {
            tam: { type: ["string", "number"] },
            sam: { type: ["string", "number"] },
            som: { type: ["string", "number"] },
            cagr: { type: ["string", "number"] },
            competitors: { type: "array" },
            signals: { type: "array" },
          },
        },
        financials: {
          type: "object",
          description: "Proposed financials. Concept AI recomputes totals & break-even.",
          properties: {
            capex: { type: "array" },
            opex: { type: "array" },
            revenue: { type: "array" },
            scenarios: { type: "array" },
            break_even_months: { type: "number" },
          },
        },
        risks: {
          type: "array",
          items: {
            type: "object",
            required: ["title", "severity"],
            properties: {
              title: { type: "string" },
              severity: { type: "string", enum: ["low", "material", "high"] },
              likelihood: { type: "string", enum: ["low", "medium", "high"] },
              mitigation: { type: "string" },
            },
          },
        },
        recommendations: { type: "array", items: { type: "string" } },
        next_steps: { type: "array", items: { type: "string" } },
        claims: {
          type: "array",
          description: "Claim-to-source mappings.",
          items: {
            type: "object",
            required: ["id", "text", "sources"],
            properties: {
              id: { type: "string" },
              text: { type: "string" },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
              sources: {
                type: "array",
                items: {
                  type: "object",
                  required: ["url"],
                  properties: {
                    url: { type: "string", format: "uri" },
                    domain: { type: "string" },
                    title: { type: "string" },
                    published_at: { type: "string" },
                  },
                },
              },
            },
          },
        },
        evidence_warnings: { type: "array", items: { type: "string" } },
      },
    },
    agent_metadata: {
      type: "object",
      description: "Optional info about the external assistant (model, version).",
      properties: {
        model: { type: "string" },
        model_version: { type: "string" },
        notes: { type: "string" },
      },
    },
  },
  additionalProperties: false,
} as const;

const ALLOWED_INDUSTRIES = new Set([
  "pmo", "it", "telecom", "infrastructure", "government", "real_estate", "other",
]);
const ALLOWED_RECOMMENDATIONS = new Set([
  "proceed", "proceed_with_caution", "revise", "do_not_proceed",
]);
const ALLOWED_SEVERITIES = new Set(["low", "material", "high"]);

export interface ValidationIssue {
  path: string;
  message: string;
}

/**
 * Lightweight validator — validates structure without pulling in ajv.
 * Returns issues list. Empty = valid.
 */
export function validateExternalAnalysis(payload: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!payload || typeof payload !== "object") {
    return [{ path: "$", message: "Payload must be an object" }];
  }
  const p = payload as Record<string, any>;

  if (typeof p.title !== "string" || p.title.trim().length < 3 || p.title.length > 200) {
    issues.push({ path: "title", message: "title must be a string (3–200 chars)" });
  }
  if (typeof p.industry !== "string" || !ALLOWED_INDUSTRIES.has(p.industry)) {
    issues.push({ path: "industry", message: `industry must be one of: ${[...ALLOWED_INDUSTRIES].join(", ")}` });
  }
  if (!p.inputs || typeof p.inputs !== "object") {
    issues.push({ path: "inputs", message: "inputs object is required" });
  }
  if (!p.analysis || typeof p.analysis !== "object") {
    issues.push({ path: "analysis", message: "analysis object is required" });
    return issues;
  }
  const a = p.analysis;
  if (!a.fmarto || typeof a.fmarto !== "object") {
    issues.push({ path: "analysis.fmarto", message: "fmarto scores object is required" });
  } else {
    for (const dim of ["feasibility", "market", "architecture", "risk", "timeline", "operations"]) {
      const v = a.fmarto[dim];
      if (v !== undefined && (typeof v !== "number" || v < 0 || v > 100)) {
        issues.push({ path: `analysis.fmarto.${dim}`, message: "must be a number 0–100" });
      }
    }
  }
  if (!a.verdict || typeof a.verdict !== "object") {
    issues.push({ path: "analysis.verdict", message: "verdict object is required" });
  } else {
    if (!ALLOWED_RECOMMENDATIONS.has(a.verdict.recommendation)) {
      issues.push({
        path: "analysis.verdict.recommendation",
        message: `must be one of: ${[...ALLOWED_RECOMMENDATIONS].join(", ")}`,
      });
    }
    if (a.verdict.confidence !== undefined) {
      const c = a.verdict.confidence;
      if (typeof c !== "number" || c < 0 || c > 1) {
        issues.push({ path: "analysis.verdict.confidence", message: "confidence must be 0–1" });
      }
    }
  }
  if (a.risks && Array.isArray(a.risks)) {
    a.risks.forEach((r: any, i: number) => {
      if (!r || typeof r !== "object" || typeof r.title !== "string") {
        issues.push({ path: `analysis.risks[${i}].title`, message: "title required" });
      }
      if (!r || !ALLOWED_SEVERITIES.has(r?.severity)) {
        issues.push({ path: `analysis.risks[${i}].severity`, message: "severity must be low|material|high" });
      }
    });
  }
  if (a.claims && Array.isArray(a.claims)) {
    a.claims.forEach((c: any, i: number) => {
      if (!c?.id || typeof c.id !== "string") {
        issues.push({ path: `analysis.claims[${i}].id`, message: "claim id required" });
      }
      if (!Array.isArray(c?.sources) || c.sources.length === 0) {
        issues.push({ path: `analysis.claims[${i}].sources`, message: "at least one source required" });
      }
    });
  }
  return issues;
}

/**
 * Normalize an external analysis payload into a canonical Concept AI report
 * object stored in `reports.output`. Concept AI's export/dashboard/scoring
 * engines then compute authoritative FMART-O and financial totals from this.
 */
export function normalizeToCanonicalOutput(payload: any) {
  const a = payload.analysis ?? {};
  return {
    schema_version: "external_agent.v1",
    source_mode: "external_agent",
    fmarto_scores: a.fmarto ?? {},
    verdict: a.verdict ?? {},
    market: a.market ?? {},
    financials: a.financials ?? {},
    risks: Array.isArray(a.risks) ? a.risks : [],
    recommendations: Array.isArray(a.recommendations) ? a.recommendations : [],
    next_steps: Array.isArray(a.next_steps) ? a.next_steps : [],
    claims: Array.isArray(a.claims) ? a.claims : [],
    evidence_warnings: Array.isArray(a.evidence_warnings) ? a.evidence_warnings : [],
    agent_metadata: payload.agent_metadata ?? {},
  };
}

/** Strip fields callers should never set (ownership, canonical validation, etc.). */
export const FORBIDDEN_INPUT_KEYS = new Set([
  "user_id", "id", "slug", "display_id", "canonical_validated",
  "root_report_id", "parent_report_id", "created_at", "updated_at",
  "is_public", "archived_at",
]);
