const REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bFinal decision\b/gi, "AI-supported recommendation"],
  [/\bSuccess probability\b/gi, "Probability of positive Year-1 financial outcome under selected assumptions"],
  [/\bGrounded evidence\b/gi, "Available external evidence"],
  [/\bLive Dashboard\b/gi, "Analysis Dashboard"],
  [/\bConfidence\b/gi, "Model-estimated confidence"],
  [/\bQA failed\b/gi, "Needs validation"],
  [/\bfallback used\b/gi, "Needs validation"],
  [/\braw error\b/gi, "technical detail"],
  [/\bdebug\b/gi, "technical detail"],
  [/\btemplate mismatch\b/gi, "format needs validation"],
];

export function sanitizeConsumerText(text: unknown): string {
  let output = text == null ? "" : String(text);
  for (const [pattern, replacement] of REPLACEMENTS) output = output.replace(pattern, replacement);
  return output
    .replace(/(?:Model-estimated\s+){2,}confidence/gi, "Model-estimated confidence")
    .replace(/\s{2,}/g, " ")
    .trim();
}
