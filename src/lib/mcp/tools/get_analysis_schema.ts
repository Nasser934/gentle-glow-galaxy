import { defineTool } from "@lovable.dev/mcp-js";
import { EXTERNAL_ANALYSIS_SCHEMA, ok } from "../shared";
import { CANONICAL_SCHEMA_VERSION, SOURCE_SCHEMA_VERSION } from "../../reportContract";
import { SUBMISSION_FIELD_RULES } from "../submissionContract";

const payload = {
  schema_version: SOURCE_SCHEMA_VERSION,
  canonical_schema_version: CANONICAL_SCHEMA_VERSION,
  schema: EXTERNAL_ANALYSIS_SCHEMA,
  field_rules: SUBMISSION_FIELD_RULES,
  note:
    "This is the exact schema the Concept AI dashboard, charts and exporters render. Call get_submission_contract for enums, examples and validation guidance.",
};

export default defineTool({
  name: "get_analysis_schema",
  title: "Get Concept AI external-analysis schema",
  description:
    "Return the JSON schema (external_agent.v1) that external assistants must follow when submitting completed feasibility analysis to Concept AI. Mirrors exactly what the application can render.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: () => ok(JSON.stringify(payload, null, 2), payload),
});
