import { describe, expect, it, vi } from "vitest";
import { createSchemaCompatibleFetch } from "@/lib/supabaseFetchCompat";

describe("Supabase report save schema compatibility", () => {
  it("retries a reports insert without save_operation_key when PostgREST reports the column missing", async () => {
    const baseFetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: "PGRST204",
        message: "Could not find the 'save_operation_key' column of 'reports' in the schema cache",
      }), { status: 400, headers: { "Content-Type": "application/json" } }))
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

  it("leaves successful requests unchanged", async () => {
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
