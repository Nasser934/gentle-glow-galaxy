import { describe, expect, it } from "vitest";
import { sanitizeFileName } from "@/lib/format";

describe("sanitizeFileName", () => {
  it("removes filesystem-invalid characters and protects empty names", () => {
    expect(sanitizeFileName("Forecast: Riyadh/2026? *final*."))
      .toBe("Forecast-_Riyadh-2026-_-final");
    expect(sanitizeFileName("...", "fallback")).toBe("fallback");
  });
});
