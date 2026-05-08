import { describe, expect, it } from "vitest";
import { safeFileName } from "./fileName";

describe("safeFileName", () => {
  it("removes reserved filename characters", () => {
    expect(safeFileName('Project: A/B\\C?*"<>|')).toBe("Project_ABC");
  });

  it("falls back when the input has no usable characters", () => {
    expect(safeFileName("////", "analysis")).toBe("analysis");
  });

  it("limits long filenames", () => {
    expect(safeFileName("a".repeat(120))).toHaveLength(80);
  });
});
