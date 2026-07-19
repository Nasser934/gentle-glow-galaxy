export type GatewayFailureCategory =
  | "ai_timeout"
  | "upstream_rate_limit"
  | "upstream_usage_limit"
  | "upstream_error"
  | "upstream_network"
  | "structured_output_missing"
  | "structured_output_invalid";

export class GatewayAttemptError extends Error {
  readonly category: GatewayFailureCategory;
  readonly status: number | null;
  readonly retryable: boolean;
  readonly modelId: string;
  readonly elapsedMs: number;

  constructor(args: {
    message: string;
    category: GatewayFailureCategory;
    status?: number | null;
    retryable: boolean;
    modelId: string;
    elapsedMs: number;
  }) {
    super(args.message);
    this.name = "GatewayAttemptError";
    this.category = args.category;
    this.status = args.status ?? null;
    this.retryable = args.retryable;
    this.modelId = args.modelId;
    this.elapsedMs = args.elapsedMs;
  }
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

type GatewayPayload = {
  choices?: Array<{
    message?: {
      tool_calls?: Array<{
        function?: { arguments?: string };
      }>;
    };
  }>;
  usage?: unknown;
};

const INCOMPATIBLE_FULL_REPORT_MODEL = "google/gemini-3-flash-preview";
const STABLE_FULL_REPORT_MODEL = "google/gemini-3.5-flash";
const STABLE_REPORT_TIMEOUT_MS = 85_000;

const isTimeoutLike = (error: unknown) =>
  error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError");

function stripUnsupportedGoogleSchemaFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripUnsupportedGoogleSchemaFields);
  if (typeof value !== "object" || value === null) return value;

  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(input)) {
    if (key === "additionalProperties" || key === "anyOf" || key === "oneOf" || key === "allOf" || key === "$schema") {
      continue;
    }
    if (key === "properties" && typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
      output.properties = Object.fromEntries(
        Object.entries(raw as Record<string, unknown>).map(([property, schema]) => [property, stripUnsupportedGoogleSchemaFields(schema)]),
      );
      continue;
    }
    if (key === "items") {
      output.items = stripUnsupportedGoogleSchemaFields(raw);
      continue;
    }
    output[key] = stripUnsupportedGoogleSchemaFields(raw);
  }
  return output;
}

function toolSchemaForModel(modelId: string, schema: unknown) {
  // Gemini/OpenRouter function declarations accept only a subset of JSON Schema.
  // Unsupported keywords such as additionalProperties and anyOf can make the
  // provider reject the entire request with HTTP 400 before generation starts.
  return modelId.startsWith("google/") ? stripUnsupportedGoogleSchemaFields(schema) : schema;
}

export function safeGatewayUserError(error: GatewayAttemptError) {
  if (error.category === "upstream_usage_limit") {
    return { status: 402, message: "The project AI usage limit has been reached. Add Lovable AI credits, then try again." };
  }
  if (error.category === "upstream_rate_limit") {
    return { status: 429, message: "The analysis service is busy. Wait briefly, then try again." };
  }
  if (error.category === "ai_timeout") {
    return { status: 504, message: "The AI model took too long to produce the report. Please retry; the system will use its fallback model when available." };
  }
  if (error.category === "structured_output_missing" || error.category === "structured_output_invalid") {
    return { status: 502, message: "The AI response was incomplete and could not be validated. Please retry." };
  }
  if (error.status === 400) {
    return { status: 502, message: "The AI service could not accept the structured report request. Please retry." };
  }
  return { status: 502, message: "The AI provider is temporarily unavailable. Please try again shortly." };
}

export async function requestStructuredReport(args: {
  apiKey: string;
  modelId: string;
  systemPrompt: string;
  userPrompt: string;
  schema: unknown;
  timeoutMs: number;
  requestId: string | null;
  attempt: number;
  fetchImpl?: FetchLike;
}) {
  const startedAt = Date.now();
  const fetchImpl = args.fetchImpl ?? fetch;
  const effectiveTimeoutMs = args.modelId === STABLE_FULL_REPORT_MODEL
    ? Math.max(args.timeoutMs, STABLE_REPORT_TIMEOUT_MS)
    : args.timeoutMs;

  console.info(JSON.stringify({
    event: "ai_attempt_started",
    requestId: args.requestId,
    attempt: args.attempt,
    model: args.modelId,
    timeoutMs: effectiveTimeoutMs,
  }));

  try {
    // The preview model is known to reject this exact large function schema with
    // HTTP 400. Fail locally and immediately so the caller can select the stable
    // fallback without wasting most of the Edge Function execution window.
    if (args.modelId === INCOMPATIBLE_FULL_REPORT_MODEL) {
      throw new GatewayAttemptError({
        message: "Model is incompatible with the full structured report schema",
        category: "upstream_error",
        status: 400,
        retryable: true,
        modelId: args.modelId,
        elapsedMs: Date.now() - startedAt,
      });
    }

    const response = await fetchImpl("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${args.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: args.modelId,
        temperature: 0.2,
        max_tokens: 7_000,
        messages: [
          { role: "system", content: args.systemPrompt },
          { role: "user", content: args.userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "provide_report",
            description: "Provide the full feasibility report.",
            parameters: toolSchemaForModel(args.modelId, args.schema),
          },
        }],
        tool_choice: { type: "function", function: { name: "provide_report" } },
      }),
      signal: AbortSignal.timeout(effectiveTimeoutMs),
    });

    const elapsedMs = Date.now() - startedAt;
    if (!response.ok) {
      const category: GatewayFailureCategory = response.status === 429
        ? "upstream_rate_limit"
        : response.status === 402
          ? "upstream_usage_limit"
          : "upstream_error";
      throw new GatewayAttemptError({
        message: `AI gateway returned ${response.status}`,
        category,
        status: response.status,
        retryable: response.status >= 500 || response.status === 408,
        modelId: args.modelId,
        elapsedMs,
      });
    }

    const data = await response.json() as GatewayPayload;
    const rawArguments = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!rawArguments) {
      throw new GatewayAttemptError({
        message: "AI did not return the required structured tool call",
        category: "structured_output_missing",
        retryable: true,
        modelId: args.modelId,
        elapsedMs,
      });
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawArguments) as Record<string, unknown>;
    } catch {
      throw new GatewayAttemptError({
        message: "AI returned malformed structured JSON",
        category: "structured_output_invalid",
        retryable: true,
        modelId: args.modelId,
        elapsedMs,
      });
    }

    console.info(JSON.stringify({
      event: "ai_attempt_completed",
      requestId: args.requestId,
      attempt: args.attempt,
      model: args.modelId,
      elapsedMs,
    }));
    return { data, parsed, elapsedMs };
  } catch (error) {
    if (error instanceof GatewayAttemptError) {
      console.warn(JSON.stringify({
        event: "ai_attempt_failed",
        requestId: args.requestId,
        attempt: args.attempt,
        model: args.modelId,
        elapsedMs: error.elapsedMs,
        category: error.category,
        status: error.status,
        retryable: error.retryable,
      }));
      throw error;
    }

    const elapsedMs = Date.now() - startedAt;
    const wrapped = new GatewayAttemptError({
      message: isTimeoutLike(error) ? "AI request timed out" : "AI network request failed",
      category: isTimeoutLike(error) ? "ai_timeout" : "upstream_network",
      retryable: true,
      modelId: args.modelId,
      elapsedMs,
    });
    console.warn(JSON.stringify({
      event: "ai_attempt_failed",
      requestId: args.requestId,
      attempt: args.attempt,
      model: args.modelId,
      elapsedMs,
      category: wrapped.category,
      retryable: true,
    }));
    throw wrapped;
  }
}

const asArray = (value: unknown) => Array.isArray(value) ? value : [];
const asRecord = (value: unknown) => typeof value === "object" && value !== null
  ? value as Record<string, unknown>
  : {};

export function compactResearchContext(raw: unknown) {
  const research = asRecord(raw);
  const citations = asArray(research.citations).slice(0, 16).map((entry) => {
    const citation = asRecord(entry);
    return {
      sourceId: citation.sourceId,
      title: citation.title,
      publisher: citation.publisher,
      domain: citation.domain,
      publicationDate: citation.publicationDate,
      sourceType: citation.sourceType,
      quality: citation.quality,
      takeaway: typeof citation.takeaway === "string" ? citation.takeaway.slice(0, 320) : citation.takeaway,
    };
  });
  const competitors = asArray(research.competitorScrapes).slice(0, 4).map((entry) => {
    const competitor = asRecord(entry);
    return {
      title: competitor.title,
      url: competitor.url,
      excerpt: typeof competitor.excerpt === "string" ? competitor.excerpt.slice(0, 420) : competitor.excerpt,
    };
  });

  return {
    coverage: research.coverage,
    reliableExternalEvidence: research.reliableExternalEvidence,
    coverageMetrics: research.coverageMetrics,
    citations,
    webSignals: asArray(research.webSignals).slice(0, 8),
    communitySignals: asArray(research.redditSignals).slice(0, 5),
    competitorEvidence: competitors,
  };
}
