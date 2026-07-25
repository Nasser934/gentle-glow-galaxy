import { defineTool } from "@lovable.dev/mcp-js";
import { SUBMISSION_CONTRACT } from "../submissionContract";

export default defineTool({
  name: "get_submission_contract",
  title: "Get Concept AI submission contract",
  description:
    "Return the complete external-analysis submission contract: schema_version, JSON schema, human-readable field rules, enums, valid and invalid examples, validation guidance and supported report types. Call this BEFORE building any payload for create_external_analysis or update_external_analysis.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: () =>
    ({
      content: [{ type: "text" as const, text: JSON.stringify(SUBMISSION_CONTRACT, null, 2) }],
      structuredContent: { contract: SUBMISSION_CONTRACT },
    }),
});
