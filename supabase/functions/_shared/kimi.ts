// Kimi Code (OpenAI-compatible) provider client.
// This is the ONLY AI provider used by Concept AI. No fallback providers.

const KIMI_ENDPOINT = "https://api.kimi.com/coding/v1/chat/completions";
export const KIMI_MODEL = "k3-256k";

export type KimiMessage = { role: "system" | "user" | "assistant"; content: string };

export class KimiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function apiKey(): string {
  const key = Deno.env.get("KIMI_CODE_API_KEY");
  if (!key) throw new KimiError(500, "KIMI_CODE_API_KEY is not configured");
  return key;
}

export interface KimiStructuredOptions {
  reasoningEffort?: "low" | "high" | "max";
  timeoutMs?: number;
}

async function callKimi(body: Record<string, unknown>, timeoutMs?: number): Promise<any> {
  let response: Response;
  try {
    response = await fetch(KIMI_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: KIMI_MODEL,
        reasoning_effort: "high",
        stream: false,
        ...body,
      }),
      signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
    });
  } catch (error) {
    if (
      error instanceof DOMException &&
      (error.name === "TimeoutError" || error.name === "AbortError")
    ) {
      throw new KimiError(
        504,
        "Kimi did not complete this report section within the processing window.",
      );
    }
    throw error;
  }

  if (!response.ok) {
    const text = await response.text();
    // Never log the key; only status + provider message.
    console.error("Kimi error", response.status, text.slice(0, 500));
    if (response.status === 429) throw new KimiError(429, "Rate limit. Try again shortly.");
    if (response.status === 401 || response.status === 403) {
      throw new KimiError(500, "AI provider authentication failed.");
    }
    if (response.status === 402) throw new KimiError(402, "AI usage limit reached.");
    throw new KimiError(502, `AI provider error (${response.status})`);
  }

  return await response.json();
}

/** Plain text completion. */
export async function kimiText(messages: KimiMessage[]): Promise<string> {
  const data = await callKimi({ messages });
  return (data.choices?.[0]?.message?.content || "").trim();
}

/** Strip markdown fences and isolate the JSON object in a text blob. */
export function extractJson(raw: string): string {
  let s = (raw || "").trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start !== -1 && end > start) s = s.slice(start, end + 1);
  return s;
}

/**
 * Structured output.
 * Kimi rejects forced tool_choice while thinking is enabled, so we request the
 * tool with tool_choice:"auto" and fall back to parsing JSON from the message
 * content when the model answers in prose. The caller's schema is unchanged.
 */
export async function kimiStructured(
  messages: KimiMessage[],
  toolName: string,
  toolDescription: string,
  parameters: Record<string, unknown>,
  options: KimiStructuredOptions = {},
): Promise<any> {
  const reasoningEffort = options.reasoningEffort ?? "high";
  const timeoutMs = Math.min(Math.max(options.timeoutMs ?? 120_000, 10_000), 120_000);

  const guided: KimiMessage[] = [
    ...messages,
    {
      role: "user",
      content:
        `Respond by calling the "${toolName}" function. If you cannot call a function, ` +
        `output ONLY the raw JSON object of its arguments (no prose, no markdown fences), ` +
        `matching this JSON Schema exactly:\n${JSON.stringify(parameters)}`,
    },
  ];

  const data = await callKimi({
    messages: guided,
    reasoning_effort: reasoningEffort,
    tools: [{ type: "function", function: { name: toolName, description: toolDescription, parameters } }],
    tool_choice: "auto",
  }, timeoutMs);

  const message = data.choices?.[0]?.message;
  const args = message?.tool_calls?.[0]?.function?.arguments;
  if (args) {
    try {
      return JSON.parse(args);
    } catch {
      return JSON.parse(extractJson(args));
    }
  }

  const content = message?.content;
  if (typeof content === "string" && content.trim()) {
    try {
      return JSON.parse(extractJson(content));
    } catch {
      // fall through
    }
  }

  throw new KimiError(502, "AI did not return a valid structured result.");
}
