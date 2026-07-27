import { promptBundle } from "./promptBundle.generated.ts";

export const REQUIRED_PROMPT_STAGES = [
  "research-planner",
  "research-reviewer",
  "concept-resolver",
  "market-analyst",
  "financial-analyst",
  "decision-analyst",
  "actions-analyst",
  "report-editor",
] as const;

export type PromptStage = typeof REQUIRED_PROMPT_STAGES[number];

export const PROMPT_BUNDLE = promptBundle;
export const PROMPT_BUNDLE_VERSION = promptBundle.version;
export const PROMPT_BUNDLE_HASH = promptBundle.hash;
export const CONCEPT_AI_POLICY_VERSION = "concept-ai-policy.v1";

export function getStagePrompt(stage: PromptStage) {
  const prompt = promptBundle.prompts[stage];
  if (!prompt) throw new Error(`Missing governed prompt stage: ${stage}`);
  return prompt;
}

export function governedStageInstruction(stage: PromptStage): string {
  return [
    promptBundle.policy.content,
    getStagePrompt(stage).content,
  ].join("\n\n");
}
