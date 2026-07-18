import { beforeEach, describe, expect, it } from "vitest";
import {
  AUTH_RETURN_PATH_KEY,
  DEFAULT_AUTH_RETURN_PATH,
  consumeAuthReturnPath,
  rememberAuthReturnPath,
  sanitizeAuthReturnPath,
} from "@/lib/authRedirect";

describe("OAuth return paths", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("preserves an internal route with query and hash", () => {
    expect(sanitizeAuthReturnPath("/reports/123?tab=evidence#claim-2"))
      .toBe("/reports/123?tab=evidence#claim-2");
  });

  it.each([
    "https://evil.example/analyze",
    "//evil.example/analyze",
    "\\evil.example\\analyze",
    "/auth",
    "/auth?next=/dashboard",
    "dashboard",
    "",
  ])("rejects unsafe or looping path %s", (value) => {
    expect(sanitizeAuthReturnPath(value)).toBe(DEFAULT_AUTH_RETURN_PATH);
  });

  it("stores, consumes, and clears the requested destination", () => {
    const remembered = rememberAuthReturnPath(window.sessionStorage, "/dashboard?view=mine");
    expect(remembered).toBe("/dashboard?view=mine");
    expect(window.sessionStorage.getItem(AUTH_RETURN_PATH_KEY)).toBe("/dashboard?view=mine");

    expect(consumeAuthReturnPath(window.sessionStorage)).toBe("/dashboard?view=mine");
    expect(window.sessionStorage.getItem(AUTH_RETURN_PATH_KEY)).toBeNull();
    expect(consumeAuthReturnPath(window.sessionStorage)).toBeNull();
  });
});
