import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConceptInputs, FeasibilityReport } from "@/types/analysis";

type MockUser = { id: string } | null;

const state = vi.hoisted(() => ({
  user: { id: "user-123" } as MockUser,
  insertPayload: null as unknown,
  updatePayload: null as unknown,
  eqCalls: [] as Array<[string, unknown]>,
  orCalls: [] as string[],
  selectArg: "",
}));

const makeBuilder = () => {
  const builder = {
    insert: vi.fn((payload: unknown) => { state.insertPayload = payload; return builder; }),
    update: vi.fn((payload: unknown) => { state.updatePayload = payload; return builder; }),
    delete: vi.fn(() => builder),
    select: vi.fn((arg?: string) => { state.selectArg = arg ?? ""; return builder; }),
    eq: vi.fn((field: string, value: unknown) => { state.eqCalls.push([field, value]); return builder; }),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    or: vi.fn((filter: string) => { state.orCalls.push(filter); return builder; }),
    single: vi.fn(async () => ({ data: { id: "report-1", slug: "abc", is_public: false }, error: null })),
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
  };
  return builder;
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: state.user }, error: null })),
    },
    from: vi.fn(() => makeBuilder()),
  },
}));

const { saveReport, publishReport, unpublishReport, deleteReport, getReportBySlug } = await import("./reports");

const minimalInputs = { projectName: "Alpha", industry: "Technology" } as unknown as ConceptInputs;
const minimalReport = { reportId: "R1" } as unknown as FeasibilityReport;

describe("report helpers", () => {
  beforeEach(() => {
    state.user = { id: "user-123" };
    state.insertPayload = null;
    state.updatePayload = null;
    state.eqCalls = [];
    state.orCalls = [];
    state.selectArg = "";
  });

  it("saves reports as private by default", async () => {
    await saveReport(minimalInputs, minimalReport);

    expect(state.insertPayload).toMatchObject({
      user_id: "user-123",
      title: "Alpha",
      industry: "Technology",
      is_public: false,
    });
    expect(state.selectArg).toBe("id, slug, is_public");
  });

  it("publishes only the signed-in user's report", async () => {
    await publishReport("report-1");

    expect(state.updatePayload).toEqual({ is_public: true });
    expect(state.eqCalls).toContainEqual(["id", "report-1"]);
    expect(state.eqCalls).toContainEqual(["user_id", "user-123"]);
  });

  it("unpublishes only the signed-in user's report", async () => {
    await unpublishReport("report-1");

    expect(state.updatePayload).toEqual({ is_public: false });
    expect(state.eqCalls).toContainEqual(["id", "report-1"]);
    expect(state.eqCalls).toContainEqual(["user_id", "user-123"]);
  });

  it("deletes only the signed-in user's report", async () => {
    await deleteReport("report-1");

    expect(state.eqCalls).toContainEqual(["id", "report-1"]);
    expect(state.eqCalls).toContainEqual(["user_id", "user-123"]);
  });

  it("allows signed-in owners to resolve their own private report slug", async () => {
    await getReportBySlug("abc");

    expect(state.eqCalls).toContainEqual(["slug", "abc"]);
    expect(state.orCalls).toContain("is_public.eq.true,user_id.eq.user-123");
  });

  it("only resolves public report slugs for anonymous users", async () => {
    state.user = null;
    await getReportBySlug("abc");

    expect(state.eqCalls).toContainEqual(["slug", "abc"]);
    expect(state.orCalls).toContain("is_public.eq.true");
  });
});
