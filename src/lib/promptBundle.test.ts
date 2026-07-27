import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  PROMPT_BUNDLE,
  PROMPT_BUNDLE_HASH,
  PROMPT_BUNDLE_VERSION,
  REQUIRED_PROMPT_STAGES,
  getStagePrompt,
} from "../../supabase/functions/_shared/ai/promptManifest.ts";

describe("generated prompt governance bundle", () => {
  it("contains every governed stage with a SHA-256 hash", () => {
    expect(PROMPT_BUNDLE_VERSION).toMatch(/^\d{4}\.\d{2}\.\d{2}\.\d+$/);
    expect(PROMPT_BUNDLE_HASH).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.keys(PROMPT_BUNDLE.prompts).sort()).toEqual(
      [...REQUIRED_PROMPT_STAGES].sort(),
    );

    for (const stage of REQUIRED_PROMPT_STAGES) {
      const prompt = getStagePrompt(stage);
      expect(prompt.content.length).toBeGreaterThan(120);
      expect(prompt.hash).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it("matches the editable Markdown and JSON sources", () => {
    expect(() => {
      execFileSync(process.execPath, ["scripts/check-prompt-bundle.mjs"], {
        cwd: process.cwd(),
        stdio: "pipe",
      });
    }).not.toThrow();
  });
});
