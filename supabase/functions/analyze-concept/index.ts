import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { inputs } = await req.json();
    console.log("Analyzing concept:", inputs?.projectName);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `You are an expert project management consultant and feasibility analyst. You help PMOs, portfolio managers, and project sponsors evaluate project concepts with structured, data-driven analysis.

You MUST respond by calling the "provide_analysis" tool with complete structured analysis results. Do not return plain text.`;

    const userPrompt = `Analyze this project concept and provide a comprehensive feasibility assessment:

**Project:** ${inputs.projectName}
**Industry:** ${inputs.industry}
**Description:** ${inputs.description}
**Strategic Objectives:** ${inputs.strategicObjectives || "Not specified"}
**Budget Range:** ${inputs.budgetRange}
**Timeline:** ${inputs.timeline}
**Team Size:** ${inputs.teamSize || "Not specified"}
**Key Dependencies:** ${inputs.dependencies || "None specified"}
**Key Assumptions:** ${inputs.assumptions || "None specified"}
**Known Constraints:** ${inputs.constraints || "None specified"}
**Critical Success Factors:** ${inputs.successFactors || "Not specified"}
**Known Risks:** ${inputs.knownRisks || "None specified"}
**Regulatory Considerations:** ${inputs.regulatoryConsiderations || "None specified"}
**Technology Readiness:** ${inputs.technologyReadiness || "Not specified"}

Provide thorough analysis with realistic scores, at least 4-6 identified risks with mitigations, and actionable next steps.`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "provide_analysis",
                description:
                  "Provide the complete feasibility analysis results for the project concept.",
                parameters: {
                  type: "object",
                  properties: {
                    scores: {
                      type: "object",
                      properties: {
                        value: { type: "number", description: "Value score 0-100. Higher = more valuable." },
                        valueExplanation: { type: "string", description: "1-2 sentence explanation of value score" },
                        risk: { type: "number", description: "Risk score 0-100. Higher = more risky." },
                        riskExplanation: { type: "string", description: "1-2 sentence explanation of risk score" },
                        complexity: { type: "number", description: "Complexity score 0-100. Higher = more complex." },
                        complexityExplanation: { type: "string", description: "1-2 sentence explanation of complexity score" },
                      },
                      required: ["value", "valueExplanation", "risk", "riskExplanation", "complexity", "complexityExplanation"],
                      additionalProperties: false,
                    },
                    recommendation: {
                      type: "string",
                      enum: ["go", "revise", "stop"],
                      description: "Overall recommendation",
                    },
                    recommendationReasoning: {
                      type: "string",
                      description: "2-3 paragraph explanation of the recommendation",
                    },
                    keyFactors: {
                      type: "array",
                      items: { type: "string" },
                      description: "3-5 key factors that influenced the recommendation",
                    },
                    risks: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          name: { type: "string" },
                          likelihood: { type: "number", description: "1-5 scale" },
                          impact: { type: "number", description: "1-5 scale" },
                          description: { type: "string" },
                          mitigation: { type: "string" },
                        },
                        required: ["name", "likelihood", "impact", "description", "mitigation"],
                        additionalProperties: false,
                      },
                      description: "4-8 identified risks",
                    },
                    summary: {
                      type: "string",
                      description: "2-3 paragraph markdown feasibility summary narrative",
                    },
                    assumptions: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          text: { type: "string" },
                          confidence: { type: "string", enum: ["high", "medium", "low"] },
                        },
                        required: ["text", "confidence"],
                        additionalProperties: false,
                      },
                      description: "3-6 key assumptions with confidence levels",
                    },
                    nextSteps: {
                      type: "array",
                      items: { type: "string" },
                      description: "3-5 suggested next steps",
                    },
                  },
                  required: [
                    "scores", "recommendation", "recommendationReasoning",
                    "keyFactors", "risks", "summary", "assumptions", "nextSteps",
                  ],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "provide_analysis" } },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI usage limit reached. Please add credits." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    console.log("AI response received");

    const toolCall = aiResponse.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      console.error("No tool call in response:", JSON.stringify(aiResponse));
      throw new Error("AI did not return structured analysis");
    }

    const analysis = JSON.parse(toolCall.function.arguments);
    console.log("Analysis parsed successfully:", analysis.recommendation);

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-concept error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
