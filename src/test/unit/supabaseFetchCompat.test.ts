import { describe, expect, it, vi } from "vitest";
import {
  ANALYSIS_CLIENT_TIMEOUT_MS,
  ANALYSIS_RETRY_DELAY_MS,
  createSchemaCompatibleFetch,
} from "@/lib/supabaseFetchCompat";

const missingColumnResponse = (column: string) => new Response(JSON.stringify({
  code: "PGRST204",
  message: `Could not find the '${column}' column of 'reports' in the schema cache`,
}), { status: 400, headers: { "Content-Type": "application/json" } });

const analysisUrl = "https://example.supabase.co/functions/v1/analyze-concept";

describe("Supabase compatibility fetch", () => {
  it("keeps the production analysis endpoint and applies a three-minute timeout", async () => {
    const successResponse = new Response(JSON.stringify({ reportId: "CAI-1" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    const baseFetch = vi.fn().mockResolvedValue(successResponse);
    const compatibleFetch = createSchemaCompatibleFetch(baseFetch as typeof fetch);

    const response = await compatibleFetch(analysisUrl, {
      method: "POST",
      body: JSON.stringify({ inputs: { projectName: "Test" } }),
    });

    expect(response).toBe(successResponse);
    expect(ANALYSIS_CLIENT_TIMEOUT_MS).toBe(180_000);
    expect(ANALYSIS_RETRY_DELAY_MS).toBe(100);
    expect(baseFetch).toHaveBeenCalledTimes(1);
    const [url, init] = baseFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(analysisUrl);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("retries one network transport failure and returns the completed report", async () => {
    const successResponse = new Response(JSON.stringify({ reportId: "CAI-2" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    const baseFetch = vi.fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(successResponse);
    const compatibleFetch = createSchemaCompatibleFetch(baseFetch as typeof fetch);

    const response = await compatibleFetch(analysisUrl, {
      method: "POST",
      body: JSON.stringify({ inputs: { projectName: "Retry" } }),
    });

    expect(response).toBe(successResponse);
    expect(baseFetch).toHaveBeenCalledTimes(2);
    const firstSignal = (baseFetch.mock.calls[0][1] as RequestInit).signal;
    const secondSignal = (baseFetch.mock.calls[1][1] as RequestInit).signal;
    expect(firstSignal).toBeInstanceOf(AbortSignal);
    expect(secondSignal).toBeInstanceOf(AbortSignal);
    expect(secondSignal).not.toBe(firstSignal);
  });

  it("retries one transient Edge Function response", async () => {
    const successResponse = new Response(JSON.stringify({ reportId: "CAI-3" }), { status: 200 });
    const baseFetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "temporary" }), { status: 503 }))
      .mockResolvedValueOnce(successResponse);
    const compatibleFetch = createSchemaCompatibleFetch(baseFetch as typeof fetch);

    const response = await compatibleFetch(analysisUrl, {
      method: "POST",
      body: JSON.stringify({ inputs: { projectName: "Retry status" } }),
    });

    expect(response).toBe(successResponse);
    expect(baseFetch).toHaveBeenCalledTimes(2);
  });

  it("does not retry authentication or validation responses", async () => {
    for (const status of [400, 401, 403, 429]) {
      const response = new Response(JSON.stringify({ error: "not transient" }), { status });
      const baseFetch = vi.fn().mockResolvedValue(response);
      const compatibleFetch = createSchemaCompatibleFetch(baseFetch as typeof fetch);

      const result = await compatibleFetch(analysisUrl, { method: "POST", body: "{}" });

      expect(result).toBe(response);
      expect(baseFetch).toHaveBeenCalledTimes(1);
    }
  });

  it("does not retry a user cancellation or the full timeout", async () => {
    const timeout = new DOMException("timed out", "TimeoutError");
    const baseFetch = vi.fn().mockRejectedValue(timeout);
    const compatibleFetch = createSchemaCompatibleFetch(baseFetch as typeof fetch);

    await expect(compatibleFetch(analysisUrl, { method: "POST", body: "{}" })).rejects.toBe(timeout);
    expect(baseFetch).toHaveBeenCalledTimes(1);
  });

  it("does not replace a caller-provided abort signal", async () => {
    const baseFetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    const compatibleFetch = createSchemaCompatibleFetch(baseFetch as typeof fetch);
    const controller = new AbortController();

    await compatibleFetch(analysisUrl, {
      method: "POST",
      signal: controller.signal,
    });

    const [url, init] = baseFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/functions/v1/analyze-concept");
    expect(url).not.toContain("analyze-concept-v2");
    expect(init.signal).toBe(controller.signal);
  });

  it("can retry an analysis Request object without losing its body", async () => {
    const bodies: string[] = [];
    const baseFetch = vi.fn(async (input: RequestInfo | URL) => {
      const request = input instanceof Request ? input : new Request(input);
      bodies.push(await request.clone().text());
      if (bodies.length === 1) throw new TypeError("temporary network failure");
      return new Response(JSON.stringify({ reportId: "CAI-4" }), { status: 200 });
    });
    const compatibleFetch = createSchemaCompatibleFetch(baseFetch as typeof fetch);
    const request = new Request(analysisUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inputs: { projectName: "Request clone" } }),
    });

    const response = await compatibleFetch(request);

    expect(response.status).toBe(200);
    expect(baseFetch).toHaveBeenCalledTimes(2);
    expect(bodies).toEqual([
      JSON.stringify({ inputs: { projectName: "Request clone" } }),
      JSON.stringify({ inputs: { projectName: "Request clone" } }),
    ]);
  });

  it("retries a reports insert without save_operation_key when PostgREST reports the column missing", async () => {
    const baseFetch = vi.fn()
      .mockResolvedValueOnce(missingColumnResponse("save_operation_key"))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: "report-1" }]), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }));

    const compatibleFetch = createSchemaCompatibleFetch(baseFetch as typeof fetch);
    const response = await compatibleFetch("https://example.supabase.co/rest/v1/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Test", save_operation_key: "abc-def-123456789" }),
    });

    expect(response.status).toBe(201);
    expect(baseFetch).toHaveBeenCalledTimes(2);
    const retryInit = baseFetch.mock.calls[1][1] as RequestInit;
    expect(JSON.parse(String(retryInit.body))).toEqual({ title: "Test" });
  });

  it("recognizes POST and body data carried by a Request object", async () => {
    const baseFetch = vi.fn()
      .mockResolvedValueOnce(missingColumnResponse("save_operation_key"))
      .mockResolvedValueOnce(new Response("[]", { status: 201 }));
    const compatibleFetch = createSchemaCompatibleFetch(baseFetch as typeof fetch);
    const request = new Request("https://example.supabase.co/rest/v1/reports", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-token",
      },
      body: JSON.stringify({ title: "Test", save_operation_key: "abc-def-123456789" }),
    });

    const response = await compatibleFetch(request);

    expect(response.status).toBe(201);
    expect(baseFetch).toHaveBeenCalledTimes(2);
    const [retryUrl, retryOptions] = baseFetch.mock.calls[1] as [string, RequestInit];
    expect(retryUrl).toContain("/rest/v1/reports");
    expect(new Headers(retryOptions.headers).get("Authorization")).toBe("Bearer test-token");
    expect(JSON.parse(String(retryOptions.body))).toEqual({ title: "Test" });
  });

  it("can remove several known optional columns while a hosted schema catches up", async () => {
    const baseFetch = vi.fn()
      .mockResolvedValueOnce(missingColumnResponse("save_operation_key"))
      .mockResolvedValueOnce(missingColumnResponse("generation_timestamp"))
      .mockResolvedValueOnce(new Response("[]", { status: 201 }));
    const compatibleFetch = createSchemaCompatibleFetch(baseFetch as typeof fetch);

    const response = await compatibleFetch("https://example.supabase.co/rest/v1/reports", {
      method: "POST",
      body: JSON.stringify({
        title: "Test",
        save_operation_key: "abc-def-123456789",
        generation_timestamp: "2026-07-18T00:00:00Z",
      }),
    });

    expect(response.status).toBe(201);
    expect(baseFetch).toHaveBeenCalledTimes(3);
    const finalInit = baseFetch.mock.calls[2][1] as RequestInit;
    expect(JSON.parse(String(finalInit.body))).toEqual({ title: "Test" });
  });

  it("does not retry unrelated PostgREST failures", async () => {
    const errorResponse = new Response(JSON.stringify({
      code: "42501",
      message: "new row violates row-level security policy",
    }), { status: 403, headers: { "Content-Type": "application/json" } });
    const baseFetch = vi.fn().mockResolvedValue(errorResponse);

    const compatibleFetch = createSchemaCompatibleFetch(baseFetch as typeof fetch);
    const response = await compatibleFetch("https://example.supabase.co/rest/v1/reports", {
      method: "POST",
      body: JSON.stringify({ title: "Test", save_operation_key: "abc-def-123456789" }),
    });

    expect(response).toBe(errorResponse);
    expect(baseFetch).toHaveBeenCalledTimes(1);
  });

  it("leaves successful non-analysis requests unchanged", async () => {
    const successResponse = new Response("[]", { status: 201 });
    const baseFetch = vi.fn().mockResolvedValue(successResponse);

    const compatibleFetch = createSchemaCompatibleFetch(baseFetch as typeof fetch);
    const response = await compatibleFetch("https://example.supabase.co/rest/v1/reports", {
      method: "POST",
      body: JSON.stringify({ title: "Test", save_operation_key: "abc-def-123456789" }),
    });

    expect(response).toBe(successResponse);
    expect(baseFetch).toHaveBeenCalledTimes(1);
  });
});
