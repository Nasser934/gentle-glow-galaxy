import { describe, expect, it, vi } from "vitest";
import {
  compactResearchContext,
  GatewayAttemptError,
  requestStructuredReport,
  safeGatewayUserError,
} from "../../../supabase/functions/_shared/analysis/gateway";

const baseArgs = {
  apiKey: "test-key",
  modelId: "google/gemini-3.5-flash",
  systemPrompt: "system",
  userPrompt: "user",
  schema: { type: "object" },
  timeoutMs: 1_000,
  requestId: "request-1",
  attempt: 1,
};

describe("analysis gateway resilience", () => {
  it("parses the required structured tool response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ finish_reason: "stop", message: { tool_calls: [{ function: { arguments: JSON.stringify({ executiveSummary: "ok" }) } }] } }],
      usage: { total_tokens: 10 },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const result = await requestStructuredReport({ ...baseArgs, fetchImpl });
    expect(result.parsed).toEqual({ executiveSummary: "ok" });
    expect(result.responseSource).toBe("tool_call");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const requestBody = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(requestBody.model).toBe("google/gemini-3.5-flash");
    expect(requestBody.max_tokens).toBe(6_000);
  });

  it("accepts valid JSON returned in message content", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ finish_reason: "stop", message: { content: "```json\n{\"executiveSummary\":\"ok\"}\n```" } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const result = await requestStructuredReport({ ...baseArgs, fetchImpl });
    expect(result.parsed).toEqual({ executiveSummary: "ok" });
    expect(result.responseSource).toBe("message_content");
  });

  it("strips Gemini-incompatible tool schema fields before sending", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { tool_calls: [{ function: { arguments: JSON.stringify({ ok: true }) } }] } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await requestStructuredReport({
      ...baseArgs,
      schema: {
        type: "object",
        properties: {
          item: {
            type: "object",
            properties: { name: { type: "string" } },
            required: ["name"],
            additionalProperties: false,
          },
          choice: { anyOf: [{ type: "string" }, { type: "number" }] },
        },
        required: ["item"],
        additionalProperties: false,
      },
      fetchImpl,
    });

    const requestBody = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    const parameters = requestBody.tools[0].function.parameters;
    expect(JSON.stringify(parameters)).not.toContain("additionalProperties");
    expect(JSON.stringify(parameters)).not.toContain("anyOf");
    expect(parameters.properties.item.required).toEqual(["name"]);
  });

  it("rejects the incompatible preview model immediately without a provider call", async () => {
    const fetchImpl = vi.fn();
    await expect(requestStructuredReport({
      ...baseArgs,
      modelId: "google/gemini-3-flash-preview",
      fetchImpl,
    })).rejects.toMatchObject({
      category: "upstream_error",
      status: 400,
      retryable: false,
      modelId: "google/gemini-3-flash-preview",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("marks timeout failures without promising an internal fallback", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError"));
    await expect(requestStructuredReport({ ...baseArgs, fetchImpl })).rejects.toMatchObject({
      category: "ai_timeout",
      retryable: false,
    });
  });

  it("distinguishes malformed from truncated structured output", async () => {
    const malformedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ finish_reason: "stop", message: { tool_calls: [{ function: { arguments: "{\"x\":}" } }] } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    await expect(requestStructuredReport({ ...baseArgs, fetchImpl: malformedFetch })).rejects.toMatchObject({
      category: "structured_output_invalid",
    });

    const truncatedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ finish_reason: "length", message: { tool_calls: [{ function: { arguments: "{\"x\":" } }] } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    await expect(requestStructuredReport({ ...baseArgs, fetchImpl: truncatedFetch })).rejects.toMatchObject({
      category: "structured_output_truncated",
    });
  });

  it("does not retry credit or rate-limit failures", async () => {
    for (const status of [402, 429]) {
      const fetchImpl = vi.fn().mockResolvedValue(new Response("{}", { status }));
      await expect(requestStructuredReport({ ...baseArgs, fetchImpl })).rejects.toMatchObject({
        status,
        retryable: false,
      });
    }
  });

  it("returns safe, specific user errors", () => {
    const error = new GatewayAttemptError({
      message: "raw provider detail",
      category: "upstream_usage_limit",
      status: 402,
      retryable: false,
      modelId: baseArgs.modelId,
      elapsedMs: 10,
    });
    expect(safeGatewayUserError(error)).toEqual({
      status: 402,
      message: "The project AI usage limit has been reached. Add Lovable AI credits, then try again.",
    });
  });

  it("removes duplicated and oversized research fields", () => {
    const compact = compactResearchContext({
      coverage: "Partial",
      reliableExternalEvidence: true,
      coverageMetrics: { reliableSourceCount: 2 },
      citations: Array.from({ length: 20 }, (_, index) => ({ sourceId: `SRC-${index}`, title: "One", takeaway: "x".repeat(900) })),
      webSignals: Array.from({ length: 20 }, (_, index) => `web-${index}`),
      redditSignals: Array.from({ length: 20 }, (_, index) => `community-${index}`),
      competitorScrapes: Array.from({ length: 10 }, () => ({ title: "Competitor", url: "https://example.com", excerpt: "y".repeat(900) })),
      verifiedMarketEvidence: [{ duplicated: true }],
      generalBackground: [{ duplicated: true }],
    });

    expect(compact.citations).toHaveLength(12);
    expect(compact.webSignals).toHaveLength(6);
    expect(compact.communitySignals).toHaveLength(3);
    expect(compact.competitorEvidence).toHaveLength(3);
    expect(JSON.stringify(compact)).not.toContain("verifiedMarketEvidence");
    expect(JSON.stringify(compact)).not.toContain("generalBackground");
  });
});
