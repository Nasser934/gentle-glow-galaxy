import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const textFrom = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;

async function safeJson(url: string) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "ConceptAIResearchBot/1.0" },
      signal: AbortSignal.timeout(6500),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (_) {
    return null;
  }
}

async function fetchPublicResearch(inputs: Record<string, string>) {
  const query = [inputs.projectName, inputs.industry, inputs.location].filter(Boolean).join(" ").slice(0, 160);
  const encoded = encodeURIComponent(query);

  const [reddit, hn, wiki, duck] = await Promise.all([
    safeJson(`https://www.reddit.com/search.json?q=${encoded}&sort=relevance&limit=8`),
    safeJson(`https://hn.algolia.com/api/v1/search?query=${encoded}&tags=story&hitsPerPage=6`),
    safeJson(`https://en.wikipedia.org/w/api.php?action=opensearch&search=${encoded}&limit=5&format=json&origin=*`),
    safeJson(`https://api.duckduckgo.com/?q=${encoded}&format=json&no_html=1&skip_disambig=1`),
  ]);

  const citations: Array<{ title: string; url: string; source: string; takeaway: string }> = [];
  const redditSignals: string[] = [];
  const webSignals: string[] = [];

  const redditPosts = reddit?.data?.children ?? [];
  for (const child of redditPosts.slice(0, 8)) {
    const post = child?.data;
    const title = textFrom(post?.title).trim();
    if (!title) continue;
    const score = Number(post?.score ?? 0);
    const comments = Number(post?.num_comments ?? 0);
    const subreddit = textFrom(post?.subreddit, "reddit");
    redditSignals.push(`${title} — r/${subreddit}, ${score} upvotes, ${comments} comments`);
    citations.push({
      title,
      source: `Reddit · r/${subreddit}`,
      url: `https://www.reddit.com${textFrom(post?.permalink, "/search")}`,
      takeaway: `Community signal with ${comments} comments and ${score} upvotes.`,
    });
  }

  for (const hit of (hn?.hits ?? []).slice(0, 6)) {
    const title = textFrom(hit?.title || hit?.story_title).trim();
    if (!title) continue;
    const points = Number(hit?.points ?? 0);
    const comments = Number(hit?.num_comments ?? 0);
    webSignals.push(`${title} — Hacker News, ${points} points, ${comments} comments`);
    citations.push({ title, source: "Hacker News", url: textFrom(hit?.url || `https://news.ycombinator.com/item?id=${hit?.objectID}`), takeaway: `Tech-market discussion signal with ${comments} comments.` });
  }

  const wikiTitles = Array.isArray(wiki?.[1]) ? wiki[1] : [];
  const wikiUrls = Array.isArray(wiki?.[3]) ? wiki[3] : [];
  wikiTitles.slice(0, 5).forEach((title: string, i: number) => {
    webSignals.push(`${title} — Wikipedia/reference coverage`);
    citations.push({ title, source: "Wikipedia", url: textFrom(wikiUrls[i], "https://www.wikipedia.org"), takeaway: "Reference coverage related to market/category context." });
  });

  const abstract = textFrom(duck?.AbstractText).trim();
  if (abstract) webSignals.unshift(abstract.slice(0, 260));

  return {
    query,
    generatedAt: new Date().toISOString(),
    redditSignals: redditSignals.slice(0, 8),
    webSignals: webSignals.slice(0, 10),
    citations: citations.slice(0, 12),
    coverage: citations.length >= 6 ? "Medium" : citations.length >= 2 ? "Low" : "Limited",
  };
}

const reportSchema = {
  type: "object",
  properties: {
    executiveSummary: { type: "string", description: "2 paragraph executive summary, plain text." },
    scores: {
      type: "object",
      properties: {
        financial:     { type: "number", description: "0-10. Financial feasibility." },
        market:        { type: "number", description: "0-10. Market attractiveness." },
        achievability: { type: "number", description: "0-10. Technical achievability." },
        risk:          { type: "number", description: "0-10. INVERSE risk score (10 = very low risk)." },
        timing:        { type: "number", description: "0-10. Market timing." },
        operational:   { type: "number", description: "0-10. Operational feasibility." },
        overall:       { type: "number", description: "0-10. Weighted overall score." },
        verdict:       { type: "string", enum: ["PROCEED", "PROCEED WITH CAUTION", "REVISE", "DO NOT PROCEED"] },
        financialFinding:     { type: "string" },
        marketFinding:        { type: "string" },
        achievabilityFinding: { type: "string" },
        riskFinding:          { type: "string" },
        timingFinding:        { type: "string" },
        operationalFinding:   { type: "string" },
      },
      required: ["financial","market","achievability","risk","timing","operational","overall","verdict",
        "financialFinding","marketFinding","achievabilityFinding","riskFinding","timingFinding","operationalFinding"],
      additionalProperties: false,
    },
    market: {
      type: "object",
      properties: {
        currency: { type: "string", description: "ISO-like currency label, e.g. SAR, USD, EUR." },
        tamLabel: { type: "string" }, tamValue: { type: "string" }, tamCagr: { type: "string" },
        samLabel: { type: "string" }, samValue: { type: "string" }, samCagr: { type: "string" },
        somLabel: { type: "string" }, somValue: { type: "string" }, somCagr: { type: "string" },
        growthChart: {
          type: "array",
          description: "5–6 year TAM/SAM growth points. Use plain numbers (in billions of currency).",
          items: {
            type: "object",
            properties: { year: { type: "string" }, tam: { type: "number" }, sam: { type: "number" } },
            required: ["year","tam","sam"], additionalProperties: false,
          },
        },
      },
      required: ["currency","tamLabel","tamValue","tamCagr","samLabel","samValue","samCagr","somLabel","somValue","somCagr","growthChart"],
      additionalProperties: false,
    },
    customer: {
      type: "object",
      properties: {
        ageLocation: { type: "string" }, income: { type: "string" }, goals: { type: "string" },
        willingnessToPay: { type: "string" }, behavior: { type: "string" },
      },
      required: ["ageLocation","income","goals","willingnessToPay","behavior"],
      additionalProperties: false,
    },
    competitors: {
      type: "array",
      description: "3–5 direct competitors.",
      items: {
        type: "object",
        properties: {
          name: { type: "string" }, model: { type: "string" }, weakness: { type: "string" }, edge: { type: "string" },
        },
        required: ["name","model","weakness","edge"], additionalProperties: false,
      },
    },
    research: {
      type: "object",
      properties: {
        overview: { type: "string", description: "Concise market research synthesis from provided public signals." },
        confidence: { type: "string", enum: ["High", "Medium", "Low"] },
        sentiment: { type: "string", enum: ["Positive", "Mixed", "Negative", "Insufficient data"] },
        keySignals: { type: "array", items: { type: "string" }, description: "5–7 concise research-backed market signals." },
        painPoints: { type: "array", items: { type: "string" }, description: "3–6 customer pain points inferred from research and concept context." },
        competitorMentions: { type: "array", items: { type: "string" }, description: "3–6 competitor/category mentions from the research context." },
        redditSignals: { type: "array", items: { type: "string" }, description: "2–5 Reddit/community insights, or note limited evidence." },
        webSignals: { type: "array", items: { type: "string" }, description: "3–6 public web/reference insights." },
      },
      required: ["overview","confidence","sentiment","keySignals","painPoints","competitorMentions","redditSignals","webSignals"],
      additionalProperties: false,
    },
    financials: {
      type: "object",
      properties: {
        currency: { type: "string" },
        capExLow: { type: "number" }, capExHigh: { type: "number" }, capExMid: { type: "number" },
        capEx: {
          type: "array",
          description: "5–8 startup cost items.",
          items: {
            type: "object",
            properties: {
              category: { type: "string" }, low: { type: "number" }, high: { type: "number" }, notes: { type: "string" },
            },
            required: ["category","low","high","notes"], additionalProperties: false,
          },
        },
        opEx: {
          type: "array",
          description: "4–6 monthly operating cost items.",
          items: {
            type: "object",
            properties: { category: { type: "string" }, monthly: { type: "number" }, annual: { type: "number" } },
            required: ["category","monthly","annual"], additionalProperties: false,
          },
        },
        scenarios: {
          type: "array",
          description: "Exactly 3 scenarios: Optimistic, Base Case, Pessimistic.",
          items: {
            type: "object",
            properties: {
              scenario: { type: "string", enum: ["Optimistic","Base Case","Pessimistic"] },
              probability: { type: "string" }, subscribersYr1: { type: "string" },
              annualRevenue: { type: "string" }, breakEven: { type: "string" },
            },
            required: ["scenario","probability","subscribersYr1","annualRevenue","breakEven"],
            additionalProperties: false,
          },
        },
        investmentRange: { type: "string" },
        breakEvenSummary: { type: "string" },
        ltvCacRatio: { type: "string" },
      },
      required: ["currency","capExLow","capExHigh","capExMid","capEx","opEx","scenarios","investmentRange","breakEvenSummary","ltvCacRatio"],
      additionalProperties: false,
    },
    risks: {
      type: "array",
      description: "5–8 risks.",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          probability: { type: "string", enum: ["Low","Med","High"] },
          impact:      { type: "string", enum: ["Low","Med","High"] },
          level:       { type: "string", enum: ["Low","Med","High"] },
          mitigation:  { type: "string" },
        },
        required: ["name","probability","impact","level","mitigation"], additionalProperties: false,
      },
    },
    fundingMix: {
      type: "array",
      description: "3–4 funding sources that sum to ~100%.",
      items: {
        type: "object",
        properties: { source: { type: "string" }, share: { type: "string" }, amount: { type: "string" }, rationale: { type: "string" } },
        required: ["source","share","amount","rationale"], additionalProperties: false,
      },
    },
    fundingAdvisory: { type: "string" },
    recommendations: { type: "array", items: { type: "string" }, description: "5–7 strategic recommendations." },
    nextSteps: { type: "array", items: { type: "string" }, description: "4–6 next steps." },
  },
  required: ["executiveSummary","scores","market","customer","competitors","research","financials","risks","fundingMix","fundingAdvisory","recommendations","nextSteps"],
  additionalProperties: false,
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { inputs } = await req.json();
    if (!inputs?.projectName || !inputs?.industry || !inputs?.description) {
      return new Response(JSON.stringify({ error: "Missing required project fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const publicResearch = await fetchPublicResearch(inputs);

    const systemPrompt = `You are an expert AI Feasibility Engine producing a board-grade business case feasibility report using the FMART framework (Financial · Market · Achievability · Risk · Timing).
You MUST call the "provide_report" tool. All numbers must be realistic given the budget, industry, geography, and timeline.
- Use the same currency the user implies via location (KSA → SAR, UAE → AED, EU → EUR, default USD).
- Pick realistic TAM/SAM/SOM with credible CAGR.
- CapEx items must sum (low/high) close to capExLow/capExHigh totals.
- Risks: pick the most material 5–8 risks with proper Prob/Impact/Level.
- Verdict must follow the overall score: ≥7.5 PROCEED, 6.0–7.4 PROCEED WITH CAUTION, 4.5–5.9 REVISE, <4.5 DO NOT PROCEED.
- Use the public research context below as directional evidence. Do not overstate it; if coverage is limited, say so in research.confidence and qualify insights.`;

    const userPrompt = `Generate the full feasibility report for this concept:

**Project:** ${inputs.projectName}
**Industry:** ${inputs.industry}
**Location:** ${inputs.location || "Not specified"}
**Description:** ${inputs.description}
**Strategic Objectives:** ${inputs.strategicObjectives || "Not specified"}
**Budget Range:** ${inputs.budgetRange || "Not specified"}
**Timeline:** ${inputs.timeline || "Not specified"}
**Team Size:** ${inputs.teamSize || "Not specified"}
**Dependencies:** ${inputs.dependencies || "None"}
**Assumptions:** ${inputs.assumptions || "None"}
**Constraints:** ${inputs.constraints || "None"}
**Success Factors:** ${inputs.successFactors || "Not specified"}
**Known Risks:** ${inputs.knownRisks || "None"}
**Regulatory:** ${inputs.regulatoryConsiderations || "None"}
**Technology Readiness:** ${inputs.technologyReadiness || "Not specified"}

Public research context from free sources (Reddit public search, Hacker News, Wikipedia/open web snippets):
${JSON.stringify(publicResearch, null, 2)}

Be specific, realistic, and consultant-grade.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [{ type: "function", function: { name: "provide_report", description: "Provide the full feasibility report.", parameters: reportSchema } }],
        tool_choice: { type: "function", function: { name: "provide_report" } },
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("analyze error", response.status, t);
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "AI usage limit reached. Add credits to continue." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI gateway ${response.status}`);
    }

    const data = await response.json();
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) {
      console.error("No tool call:", JSON.stringify(data).slice(0, 500));
      throw new Error("AI did not return structured report");
    }
    const parsed = JSON.parse(args);

    // Re-shape financials.capEx totals into the client shape
    const report = {
      reportId: `FSB-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      dateIssued: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      classification: "Confidential",
      preparedBy: "AI Feasibility Engine v2.1",
      methodology: "FMART Framework — 5-Dimension Weighted Scoring",
      executiveSummary: parsed.executiveSummary,
      scores: parsed.scores,
      market: parsed.market,
      customer: parsed.customer,
      competitors: parsed.competitors,
      research: {
        ...parsed.research,
        citations: publicResearch.citations,
      },
      financials: {
        currency: parsed.financials.currency,
        capExTotal: { low: parsed.financials.capExLow, high: parsed.financials.capExHigh, mid: parsed.financials.capExMid },
        capEx: parsed.financials.capEx,
        opEx: parsed.financials.opEx,
        scenarios: parsed.financials.scenarios,
        investmentRange: parsed.financials.investmentRange,
        breakEvenSummary: parsed.financials.breakEvenSummary,
        ltvCacRatio: parsed.financials.ltvCacRatio,
      },
      risks: parsed.risks,
      fundingMix: parsed.fundingMix,
      fundingAdvisory: parsed.fundingAdvisory,
      recommendations: parsed.recommendations,
      nextSteps: parsed.nextSteps,
    };

    return new Response(JSON.stringify(report), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("analyze-concept error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
