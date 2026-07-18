import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const chain = {
    update: vi.fn(),
    eq: vi.fn(),
    select: vi.fn(),
    maybeSingle: vi.fn(),
  };
  chain.update.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  return {
    chain,
    getUser: vi.fn(),
    from: vi.fn(() => chain),
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  },
}));

import { setReportVisibility, updateReportStatus } from "@/lib/reports";

describe("owner-controlled sharing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.chain.update.mockReturnValue(mocks.chain);
    mocks.chain.eq.mockReturnValue(mocks.chain);
    mocks.chain.select.mockReturnValue(mocks.chain);
  });

  it("enables a public report only for the authenticated owner", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "owner-1" } } });
    mocks.chain.maybeSingle.mockResolvedValue({
      data: { id: "report-1", slug: "safe-slug", is_public: true },
      error: null,
    });

    await expect(setReportVisibility("report-1", true)).resolves.toMatchObject({ is_public: true });
    expect(mocks.chain.eq).toHaveBeenCalledWith("id", "report-1");
    expect(mocks.chain.eq).toHaveBeenCalledWith("user_id", "owner-1");
  });

  it("revokes an existing public report", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "owner-1" } } });
    mocks.chain.maybeSingle.mockResolvedValue({
      data: { id: "report-1", slug: "safe-slug", is_public: false },
      error: null,
    });

    await expect(setReportVisibility("report-1", false)).resolves.toMatchObject({ is_public: false });
    expect(mocks.chain.update).toHaveBeenCalledWith({ is_public: false });
  });

  it("blocks signed-out visibility changes", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    await expect(setReportVisibility("report-1", true)).rejects.toThrow("Sign in");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("treats a non-owner RLS no-op as a failure", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "different-user" } } });
    mocks.chain.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(setReportVisibility("report-1", true)).rejects.toThrow("Only the report owner");
  });

  it("does not report success when the stored visibility differs", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "owner-1" } } });
    mocks.chain.maybeSingle.mockResolvedValue({
      data: { id: "report-1", slug: "safe-slug", is_public: false },
      error: null,
    });
    await expect(setReportVisibility("report-1", true)).rejects.toThrow("Visibility was not updated");
  });

  it("updates status through the report row and lets the database create audit history", async () => {
    mocks.chain.maybeSingle.mockResolvedValue({
      data: { id: "report-1", status: "in_review" },
      error: null,
    });

    await expect(updateReportStatus("report-1", "in_review")).resolves.toMatchObject({ status: "in_review" });
    expect(mocks.from).toHaveBeenCalledTimes(1);
    expect(mocks.from).toHaveBeenCalledWith("reports");
    expect(mocks.chain.update).toHaveBeenCalledWith({ status: "in_review" });
  });

  it("treats an unauthorized status RLS no-op as a failure", async () => {
    mocks.chain.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(updateReportStatus("report-1", "approved")).rejects.toThrow("Only the report owner");
  });
});
