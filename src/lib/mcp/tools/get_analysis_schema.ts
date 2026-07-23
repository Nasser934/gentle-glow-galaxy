import { defineTool } from "@lovable.dev/mcp-js";
import { EXTERNAL_ANALYSIS_SCHEMA, ok } from "../shared";

export default defineTool({
  name: "get_analysis_schema",
  title: "Get Concept AI external-analysis schema",
  description:
    "Return the JSON schema that external assistants must follow when submitting completed feasibility analysis to Concept AI (create_external_analysis / update_external_analysis).",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: () =>
    ok(JSON.stringify(EXTERNAL_ANALYSIS_SCHEMA, null, 2), {
      schema: EXTERNAL_ANALYSIS_SCHEMA,
    }),
});
