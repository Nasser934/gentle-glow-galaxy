import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { MAX_PAYLOAD_BYTES, err, ok, validateExternalAnalysis } from "../shared";

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
    const raw = JSON.stringify(payload ?? {});
    if (raw.length > MAX_PAYLOAD_BYTES) {
      return err(`Payload exceeds ${MAX_PAYLOAD_BYTES} bytes`);
    }
    const issues = validateExternalAnalysis(payload);
    return ok(
      issues.length === 0
        ? "Payload is valid."
        : `Found ${issues.length} issue(s):\n${issues.map((i) => `- ${i.path}: ${i.message}`).join("\n")}`,
      { valid: issues.length === 0, issues },
    );
  },
});
