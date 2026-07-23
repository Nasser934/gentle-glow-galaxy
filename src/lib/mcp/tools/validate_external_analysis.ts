import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import {
  err,
  ok,
  prepareExternalAnalysisForSave,
  validationErrorResult,
} from "../shared";

export default defineTool({
  name: "validate_external_analysis",
  title: "Validate external analysis payload",
  description:
    "Dry-run validation of a proposed external analysis payload against Concept AI's schema. Returns a list of issues (empty = valid). Does not persist anything.",
  inputSchema: {
    payload: z.any().describe("The external analysis JSON payload to validate."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ payload }, ctx) => {
    if (!ctx.isAuthenticated()) return err("Not authenticated");
    const result = prepareExternalAnalysisForSave(payload, {
      reportId: "EXTERNAL-VALIDATION",
    });
    if (!result.valid) return validationErrorResult(result.issues);
    return ok("Payload is valid and can be saved in the canonical report structure.", {
      valid: true,
      issues: [],
      warnings: result.warnings,
      authoritative_scores: result.output.scores,
    });
  },
});
