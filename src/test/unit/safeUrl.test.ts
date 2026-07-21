import { describe, expect, it } from "vitest";
import { safeExternalUrl } from "@/lib/safeUrl";

describe("safeExternalUrl", () => {
  it("allows only web URLs", () => {
    expect(safeExternalUrl("https://example.com/source")).toBe("https://example.com/source");
    expect(safeExternalUrl("http://example.com/source")).toBe("http://example.com/source");
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("data:text/html,pwned")).toBeNull();
    expect(safeExternalUrl("not a URL")).toBeNull();
  });
});
