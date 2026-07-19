import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { deepSanitize } from "../_shared/sanitize.ts";
import { pseudonymousIpHash } from "../_shared/rateLimit.ts";
import { buildCanonicalReport } from "../_shared/analysis/canonical.ts";
import { validateConceptInputs, validateInputOrigins } from "../_shared/analysis/input.ts";
import {
  assessCoverage,
  canonicalizeUrl,
  domainForUrl,
  finalizeCitations,
  isPublicResearchUrl,
  qualityForWebDomain,
  type CitationCandidate,
} from "../_shared/analysis/research.ts";
import {
  compactResearchContext,
  GatewayAttemptError,
  requestStructuredReport,
  safeGatewayUserError,
} from "../_shared/analysis/gateway.ts";

const DEFAULT_ALLOWED_ORIGINS = [
  "https://gentle-glow-galaxy.lovable.app",
  "http://localhost:5173",
  "http://localhost:8080",
];

function allowedOrigins() {
  const configured = (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...configured]);
}

function buildCorsHeaders(req: Request) {
  const origin = req.headers.get("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, idempotency-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  if (origin && allowedOrigins().has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

const textFrom = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeUsageMetadata(raw: unknown) {
  if (!raw || typeof raw !== "object") return {};
  const usage = raw as Record<string, unknown>;
  const allowed = ["prompt_tokens", "completion_tokens", "total_tokens"];
  return Object.fromEntries(allowed.flatMap((key) => {
    const value = Number(usage[key]);
    return Number.isFinite(value) && value >= 0 ? [[key, value]] : [];
  }));
}

async function safeJson(url: string, init?: RequestInit) {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { "User-Agent": "ConceptAIResearchBot/1.0", ...(init?.headers || {}) },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (_) { return null; }
}

async function tavilySearch(query: string) {
  const key = Deno.env.get("TAVILY_API_KEY");
  if (!key) return null;
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key, query, search_depth: "basic",
        max_results: 8, include_answer: true, include_raw_content: false,
        time_range: "year",
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) { console.warn("Tavily HTTP", res.status); return null; }
    return await res.json();
  } catch (e) { console.warn("Tavily err", e); return null; }
}

async function extractCompetitors(rawUrls: string) {
  const key = Deno.env.get("TAVILY_API_KEY");
  if (!key) return [];
  const urls = (rawUrls || "")
    .split(/[\s,]+/)
    .map((value) => canonicalizeUrl(value.trim()))
    .filter((value) => value && isPublicResearchUrl(value))
    .slice(0, 4);
  if (!urls.length) return [];
  try {
    const response = await fetch("https://api.tavily.com/extract", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        urls,
        extract_depth: "basic",
        format: "text",
        timeout: 8,
        include_usage: false,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.warn("Tavily extract HTTP", response.status);
      return [];
    }
    const payload = await response.json();
    return (Array.isArray(payload?.results) ? payload.results : []).flatMap((result: unknown) => {
      if (!result || typeof result !== "object") return [];
      const item = result as Record<string, unknown>;
      const url = canonicalizeUrl(textFrom(item.url));
      const excerpt = textFrom(item.raw_content).replace(/\s+/g, " ").trim().slice(0, 1200);
      if (!url || !urls.includes(url) || !excerpt) return [];
      return [{ url, title: domainForUrl(url) || null, excerpt }];
    });
  } catch (error) {
    console.warn("Tavily extract failed", error instanceof Error ? error.name : "unknown");
    return [];
  }
}

async function fetchPublicResearch(inputs: Record<string, string>) {
  const query = [inputs.projectName, inputs.industry, inputs.location].filter(Boolean).join(" ").slice(0, 160);
  const tavilyQuery = [inputs.projectName, inputs.industry, inputs.location, "market size competitors"].filter(Boolean).join(" ").slice(0, 200);
  const encoded = encodeURIComponent(query);

  const [reddit, hn, wiki, duck, tavily, competitors] = await Promise.all([
    safeJson(`https://www.reddit.com/search.json?q=${encoded}&sort=relevance&limit=8`),
    safeJson(`https://hn.algolia.com/api/v1/search?query=${encoded}&tags=story&hitsPerPage=6`),
    safeJson(`https://en.wikipedia.org/w/api.php?action=opensearch&search=${encoded}&limit=5&format=json&origin=*`),
    safeJson(`https://api.duckduckgo.com/?q=${encoded}&format=json&no_html=1&skip_disambig=1`),
    tavilySearch(tavilyQuery),
    extractCompetitors(inputs.competitorUrls || ""),
  ]);

  const candidates: CitationCandidate[] = [];
  const redditSignals: string[] = [];
  const webSignals: string[] = [];

  // Tavily — highest-value source
  if (tavily?.answer) webSignals.unshift(`Tavily synthesis: ${String(tavily.answer).slice(0, 320)}`);
  for (const r of (tavily?.results ?? []).slice(0, 6)) {
    const title = textFrom(r?.title).trim();
    const url = textFrom(r?.url);
    if (!title || !url) continue;
    const snippet = textFrom(r?.content).slice(0, 260);
    webSignals.push(`${title} — ${snippet}`);
    const canonicalUrl = canonicalizeUrl(url);
    const domain = domainForUrl(canonicalUrl);
    const quality = qualityForWebDomain(domain);
    const sourceType = [
      "Primary official source",
      "Government or regulator",
      "Academic or institutional",
      "Reputable industry research",
    ].includes(quality)
      ? "Verified market evidence" as const
      : "General background" as const;
    candidates.push({
      title,
      source: "Web research",
      publisher: domain,
      url: canonicalUrl,
      takeaway: snippet || "Public web context; direct claim support must be checked.",
      publicationDate: textFrom(r?.published_date) || null,
      sourceType,
      quality,
    });
  }

  const redditPosts = reddit?.data?.children ?? [];
  for (const child of redditPosts.slice(0, 8)) {
    const post = child?.data;
    const title = textFrom(post?.title).trim();
    if (!title) continue;
    const score = Number(post?.score ?? 0);
    const comments = Number(post?.num_comments ?? 0);
    const subreddit = textFrom(post?.subreddit, "reddit");
    redditSignals.push(`${title} — r/${subreddit}, ${score} upvotes, ${comments} comments`);
    candidates.push({
      title, source: `Reddit · r/${subreddit}`,
      url: `https://www.reddit.com${textFrom(post?.permalink, "/search")}`,
      takeaway: `Community signal with ${comments} comments and ${score} upvotes.`,
      publicationDate: post?.created_utc ? new Date(Number(post.created_utc) * 1000).toISOString() : null,
      sourceType: "Community discussion",
      quality: "Community signal",
    });
  }

  for (const hit of (hn?.hits ?? []).slice(0, 6)) {
    const title = textFrom(hit?.title || hit?.story_title).trim();
    if (!title) continue;
    const points = Number(hit?.points ?? 0);
    const comments = Number(hit?.num_comments ?? 0);
    webSignals.push(`${title} — Hacker News, ${points} points, ${comments} comments`);
    candidates.push({
      title,
      source: "Hacker News",
      url: textFrom(hit?.url || `https://news.ycombinator.com/item?id=${hit?.objectID}`),
      takeaway: `Community discussion signal with ${comments} comments.`,
      publicationDate: textFrom(hit?.created_at) || null,
      sourceType: "Community discussion",
      quality: "Community signal",
    });
  }

  const wikiTitles = Array.isArray(wiki?.[1]) ? wiki[1] : [];
  const wikiUrls = Array.isArray(wiki?.[3]) ? wiki[3] : [];
  wikiTitles.slice(0, 5).forEach((title: string, i: number) => {
    webSignals.push(`${title} — Wikipedia/reference coverage`);
    candidates.push({
      title,
      source: "Wikipedia",
      url: textFrom(wikiUrls[i], "https://www.wikipedia.org"),
      takeaway: "General background only; not direct verification of a report figure.",
      sourceType: "General background",
      quality: "General reference",
    });
  });

  const abstract = textFrom(duck?.AbstractText).trim();
  if (abstract) {
    webSignals.unshift(abstract.slice(0, 260));
    const abstractUrl = textFrom(duck?.AbstractURL);
    if (abstractUrl) candidates.push({
      title: textFrom(duck?.Heading, "Reference result"),
      source: textFrom(duck?.AbstractSource, "DuckDuckGo reference"),
      url: abstractUrl,
      takeaway: abstract.slice(0, 260),
      sourceType: "General background",
      quality: "General reference",
    });
  }

  // Competitor scrapes — directly cited
  for (const c of competitors) {
    candidates.push({
      title: c.title || c.url,
      source: "Competitor-provided information",
      url: c.url,
      takeaway: c.excerpt.slice(0, 240),
      sourceType: "Competitor-provided information",
      quality: "Company source",
    });
    webSignals.push(`${c.title || c.url} — homepage excerpt: ${c.excerpt.slice(0, 220)}`);
  }

  const citations = finalizeCitations(candidates);
  const coverageAssessment = assessCoverage(citations);
  return {
    query, generatedAt: new Date().toISOString(),
    redditSignals: redditSignals.slice(0, 8),
    webSignals: webSignals.slice(0, 14),
    citations,
    competitorScrapes: competitors,
    verifiedMarketEvidence: citations.filter((citation) => citation.sourceType === "Verified market evidence"),
    communityDiscussion: citations.filter((citation) => citation.sourceType === "Community discussion"),
    generalBackground: citations.filter((citation) => citation.sourceType === "General background"),
    competitorProvidedInformation: citations.filter((citation) => citation.sourceType === "Competitor-provided information"),
    coverage: coverageAssessment.coverage,
    coverageMetrics: coverageAssessment.metrics,
    reliableExternalEvidence: coverageAssessment.reliableExternalEvidence,
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
        weights: {
          type: "object",
          description: "FMART-O dimension weights as decimals 0-1, summing to 1.0. Adapt to industry: capex-heavy projects weight Financial+Risk higher; tech startups weight Market+Timing higher.",
          properties: {
            financial: { type: "number" }, market: { type: "number" }, achievability: { type: "number" },
            risk: { type: "number" }, timing: { type: "number" }, operational: { type: "number" },
          },
          required: ["financial","market","achievability","risk","timing","operational"],
          additionalProperties: false,
        },
        confidence: {
          type: "object",
          description: "Per-dimension model-estimated confidence indicator 0-100. This is not statistical certainty; lower it where evidence is thin.",
          properties: {
            financial: { type: "number" }, market: { type: "number" }, achievability: { type: "number" },
            risk: { type: "number" }, timing: { type: "number" }, operational: { type: "number" },
          },
          required: ["financial","market","achievability","risk","timing","operational"],
          additionalProperties: false,
        },
        rationale: {
          type: "object",
          description: "1–2 sentence rationale per dimension explaining the score. Reference evidence and assumptions.",
          properties: {
            financial: { type: "string" }, market: { type: "string" }, achievability: { type: "string" },
            risk: { type: "string" }, timing: { type: "string" }, operational: { type: "string" },
          },
          required: ["financial","market","achievability","risk","timing","operational"],
          additionalProperties: false,
        },
      },
      required: ["financial","market","achievability","risk","timing","operational","overall","verdict",
        "financialFinding","marketFinding","achievabilityFinding","riskFinding","timingFinding","operationalFinding",
        "weights","confidence","rationale"],
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
          description: "5–6 year TAM/SAM growth points. Use full currency-unit numbers: 12B must be 12000000000, not 12. The first point must align with tamValue/samValue.",
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
        projectType: { type: "string", enum: ["commercial", "internal"] },
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
              adoptionRate: { type: "number" },
              annualLabourCostAvoided: { type: "number" },
              annualProductivityBenefit: { type: "number" },
              annualFinancialBenefit: { type: "number" },
              annualValueDisplay: { type: "string" },
            },
            required: ["scenario","probability","breakEven"],
            anyOf: [
              { required: ["annualRevenue"] },
              { required: ["annualFinancialBenefit"] },
              { required: ["annualValueDisplay"] },
            ],
            additionalProperties: false,
          },
        },
        investmentRange: { type: "string" },
        breakEvenSummary: { type: "string" },
        ltvCacRatio: { type: "string" },
      },
      required: ["currency","projectType","capExLow","capExHigh","capExMid","capEx","opEx","scenarios","investmentRange","breakEvenSummary"],
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

    inputQualityScore: { type: "number", description: "0-100. Overall quality of the user-supplied brief." },
    inputCompleteness: {
      type: "object",
      properties: {
        overall: { type: "number" },
        missingFields: { type: "array", items: { type: "string" } },
        weakFields: { type: "array", items: { type: "string" } },
        contradictoryFields: { type: "array", items: { type: "string" } },
      },
      required: ["overall","missingFields","weakFields","contradictoryFields"],
      additionalProperties: false,
    },
    evidenceMix: {
      type: "object",
      description: "Whole-report mix. Three integer percents that sum to 100.",
      properties: {
        userInputPercent: { type: "number" },
        webResearchPercent: { type: "number" },
        aiAssumptionPercent: { type: "number" },
      },
      required: ["userInputPercent","webResearchPercent","aiAssumptionPercent"],
      additionalProperties: false,
    },
    scoreExplanation: {
      type: "array",
      description: "One row per FMART-O dimension (6 total).",
      items: {
        type: "object",
        properties: {
          dimension: { type: "string", enum: ["financial","market","achievability","risk","timing","operational"] },
          label: { type: "string" },
          score: { type: "number" },
          positiveDrivers: { type: "array", items: { type: "string" } },
          negativeDrivers: { type: "array", items: { type: "string" } },
          missingEvidence: { type: "array", items: { type: "string" } },
          improvementActions: { type: "array", items: { type: "string" } },
          decisionImplication: { type: "string" },
        },
        required: ["dimension","label","score","positiveDrivers","negativeDrivers","missingEvidence","improvementActions","decisionImplication"],
        additionalProperties: false,
      },
    },
    claimEvidenceMap: {
      type: "array",
      description: "Key report claims with explicit provenance and exact source-ID relationships. Never attach a source unless it directly supports that claim.",
      items: {
        type: "object",
        properties: {
          claimId: { type: "string" },
          claimText: { type: "string" },
          reportSection: { type: "string" },
          userInputPercent: { type: "number" },
          webResearchPercent: { type: "number" },
          aiAssumptionPercent: { type: "number" },
          calculationPercent: { type: "number" },
          confidence: { type: "string", enum: ["High","Medium","Low"] },
          provenance: { type: "string", enum: ["User input","Cited source","Calculation","AI inference","Mixed","Unknown"] },
          supportingSourceIds: { type: "array", items: { type: "string" } },
          conflictingSourceIds: { type: "array", items: { type: "string" } },
          dimensions: {
            type: "array",
            items: { type: "string", enum: ["financial","market","achievability","risk","timing","operational"] },
          },
          userCanImproveBy: { type: "string" },
        },
        required: ["claimId","claimText","reportSection","userInputPercent","webResearchPercent","calculationPercent","aiAssumptionPercent","confidence","provenance","supportingSourceIds","conflictingSourceIds","dimensions","userCanImproveBy"],
        additionalProperties: false,
      },
    },
  },
  required: [
    "executiveSummary","scores","market","customer","competitors","research","financials","risks",
    "fundingMix","fundingAdvisory","recommendations","nextSteps","inputQualityScore",
    "inputCompleteness","evidenceMix","scoreExplanation","claimEvidenceMap",
  ],
  additionalProperties: false,
};

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const origin = req.headers.get("origin");
  if (origin && !corsHeaders["Access-Control-Allow-Origin"]) {
    return new Response(JSON.stringify({ error: "Origin is not allowed." }), {
      status: 403,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed." }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  let requestId: string | null = null;
  let requestClient: ReturnType<typeof createClient> | null = null;
  let modelIdForLog: string | null = null;
  let researchStatus = "not_requested";
  let failureCategory = "internal_error";

  try {
    // Require authenticated user (mitigates SSRF abuse and budget abuse)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Please sign in to run an analysis." }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    requestClient = supabaseAuth;
    let userId: string | undefined;
    try {
      const { data: claimsData } = await supabaseAuth.auth.getClaims(token);
      userId = claimsData?.claims?.sub as string | undefined;
    } catch (_) { /* fall through to getUser */ }
    if (!userId) {
      const { data: userData, error: userErr } = await supabaseAuth.auth.getUser(token);
      if (userErr || !userData?.user?.id) {
        console.warn("auth failed:", userErr?.message);
        return new Response(JSON.stringify({ error: "Your session has expired. Please sign in again." }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = userData.user.id;
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON request." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }
    const validated = validateConceptInputs(body?.inputs ?? {});
    if (!validated.success) {
      return new Response(JSON.stringify({
        error: "The concept brief needs correction before analysis.",
        issues: validated.issues.map((issue) => ({ code: issue.code, field: issue.field, message: issue.message })),
      }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const inputs: Record<string, string> = {
      ...validated.data,
      competitorUrls: validated.data.competitorUrls.join("\n"),
    };
    const inputOrigins = validateInputOrigins(body.inputOrigins);

    const orderedInputOrigins = Object.fromEntries(
      Object.entries(inputOrigins).sort(([left], [right]) => left.localeCompare(right)),
    );
    const inputHash = await sha256(JSON.stringify({ inputs, inputOrigins: orderedInputOrigins }));
    const suppliedIdempotencyKey = textFrom(req.headers.get("idempotency-key") || body.idempotencyKey).trim();
    const idempotencyKey = /^[A-Za-z0-9._:-]{16,128}$/.test(suppliedIdempotencyKey)
      ? suppliedIdempotencyKey
      : `legacy-${inputHash.slice(0, 40)}-${Math.floor(Date.now() / 60_000)}`;
    const ipHash = await pseudonymousIpHash(req);
    const { data: requestRows, error: requestError } = await supabaseAuth.rpc("begin_analysis_request", {
      p_function_name: "analyze-concept",
      p_idempotency_key: idempotencyKey,
      p_request_hash: `sha256:${inputHash}`,
      p_ip_hash: ipHash,
    });
    if (requestError || !requestRows?.length) {
      console.error(JSON.stringify({ event: "analysis_usage_control_unavailable", category: "persistent_rate_limit" }));
      return new Response(JSON.stringify({ error: "Analysis is temporarily unavailable. Please try again shortly." }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60", "Cache-Control": "no-store" },
      });
    }
    const requestDecision = requestRows[0] as { request_id: string | null; allowed: boolean; reason: string; retry_after_seconds: number };
    requestId = requestDecision.request_id;
    if (!requestDecision.allowed) {
      const duplicate = requestDecision.reason === "duplicate_request";
      return new Response(JSON.stringify({
        error: duplicate ? "This analysis request is already running or completed." : "Usage limit reached. Please try again later.",
        requestId,
      }), {
        status: duplicate ? 409 : 429,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Retry-After": String(requestDecision.retry_after_seconds || (duplicate ? 15 : 60)),
          "Cache-Control": "no-store",
        },
      });
    }
    console.info(JSON.stringify({ event: "analysis_request_started", requestId, function: "analyze-concept" }));

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      failureCategory = "configuration";
      throw new Error("AI service is not configured");
    }

    const publicResearch = await fetchPublicResearch(inputs);
    researchStatus = publicResearch.coverage === "Sufficient" || publicResearch.coverage === "Partial"
      ? "complete"
      : publicResearch.coverage === "Limited"
        ? "partial"
        : "failed";
    console.info(JSON.stringify({
      event: "research_completed",
      requestId,
      status: researchStatus,
      sourceCount: publicResearch.citations.length,
      reliableSourceCount: publicResearch.coverageMetrics.reliableSourceCount,
    }));

    const systemPrompt = `You are Concept AI's evidence-aware feasibility analyst producing an early-stage decision-support report using FMART-O (Financial · Market · Achievability · Risk · Timing · Operational).
You MUST call the "provide_report" tool. Clearly separate user inputs, cited public evidence, calculations, and AI assumptions.
- Use the same currency the user implies via location (KSA → SAR, UAE → AED, EU → EUR, default USD).
- Never present an AI-generated number as verified evidence. If TAM, SAM, SOM, CAGR, costs, or benefits lack direct evidence or calculation inputs, mark the narrative as an AI estimate requiring validation or use "Requires validation" rather than false precision.
- CapEx items must sum (low/high) close to capExLow/capExHigh totals.
- Set financials.projectType to "internal" when value comes from cost avoidance, labour savings, productivity, or avoided spend. Internal scenarios must use adoptionRate, annualLabourCostAvoided, annualProductivityBenefit, and annualFinancialBenefit; do not use subscribers, CAC, conversion, or commercial revenue.
- Set financials.projectType to "commercial" only when the brief defines an external customer and revenue model. Unsupported precise figures must be described as estimates requiring validation.
- Risks: pick the most material 5–8 risks with proper Prob/Impact/Level.
- The overall score, weights, confidence caps, and verdict you propose are advisory only. The server will validate and recompute the authoritative result.
- Set the model-estimated confidence indicator honestly (0–100). It is not accuracy or statistical certainty. If reliable external research is missing, lower Market/Timing confidence accordingly.
- Provide a concise rationale per dimension referencing the evidence and assumptions used.
- Use the research context below according to its quality labels. Community discussion is directional only. Competitor pages are company claims, not independent verification. General references are background, not direct support for financial figures.
- Use a citation only when its exact sourceId directly supports the claim. List conflicts separately. An unsupported financial claim must have no supporting source IDs and must be described as "AI-estimated assumption — not externally verified".

CONSUMER EVIDENCE LAYER — also populate these new fields:
- inputQualityScore (0-100): overall quality of the brief.
- inputCompleteness: list missingFields, weakFields, contradictoryFields by their human-readable labels (e.g. "Revenue model & pricing", "Competitors").
- evidenceMix: a model proposal only; the server will replace it with an Estimated Evidence Composition heuristic and ensure AI inference cannot disappear.
- scoreExplanation: one row per dimension (financial, market, achievability, risk, timing, operational) with positiveDrivers, negativeDrivers, missingEvidence, improvementActions, decisionImplication.
- claimEvidenceMap: 4–6 stable claim IDs with explicit provenance, FMART-O dimensions, supportingSourceIds and conflictingSourceIds. The four composition values must sum to 100. Do not use title similarity or keywords to attach evidence.

CONSUMER-SAFE WORDING. Never use developer/QA language anywhere in user-visible text. Forbidden: "QA failed", "fallback used", "template mismatch", "source notes empty", "repair attempt", "raw error", "debug", "report quality weak". Prefer: "Needs validation", "Evidence is limited", "Input detail is incomplete", "Financial assumptions should be refined", "Market demand should be validated before launch", "This report is suitable for early decision-making, not final investment approval".`;

    const userPrompt = `Generate the full feasibility report for this concept:

**Project:** ${inputs.projectName}
**Industry:** ${inputs.industry}
**Location:** ${inputs.location || "Not specified"}
**Description:** ${inputs.description}
**Strategic Objectives:** ${inputs.strategicObjectives || "Not specified"}
**Business Model:** ${inputs.businessModel || "Not specified"}
**Revenue Model:** ${inputs.revenueModel || "Not specified"}
**Founder / Team Experience:** ${inputs.founderExperience || "Not specified"}
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
**Competitor URLs (user-supplied):** ${inputs.competitorUrls || "None"}

Research context — coverage=${publicResearch.coverage}, reliableExternalEvidence=${publicResearch.reliableExternalEvidence}:
${JSON.stringify(compactResearchContext(publicResearch), null, 2)}

Be specific, realistic, and consultant-grade. Reference research only through the exact sourceId supplied in the research context.`;

    // Full structured report path uses the stable model only. The preview
    // model rejects this schema with HTTP 400 and would waste the invocation
    // budget. A retry must be a new user request, not another long attempt.
    const REPORT_MODEL_ID = "google/gemini-3.5-flash";
    const modelCandidates = [REPORT_MODEL_ID];
    const promptVersion = "concept-ai-2026-07-19.2";
    failureCategory = "ai_request";

    let modelId = modelCandidates[0];
    // The provider payload is validated against reportSchema before use.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let parsed: any = null;
    let lastGatewayError: GatewayAttemptError | null = null;

    for (let attemptIndex = 0; attemptIndex < modelCandidates.length; attemptIndex++) {
      modelId = modelCandidates[attemptIndex];
      modelIdForLog = modelId;
      try {
        const result = await requestStructuredReport({
          apiKey: LOVABLE_API_KEY,
          modelId,
          systemPrompt,
          userPrompt,
          schema: reportSchema,
          timeoutMs: 90_000,
          requestId,
          attempt: attemptIndex + 1,
        });
        data = result.data;
        parsed = result.parsed;
        lastGatewayError = null;
        break;
      } catch (error) {
        if (!(error instanceof GatewayAttemptError)) throw error;
        lastGatewayError = error;
        failureCategory = error.category;
        const hasFallback = attemptIndex < modelCandidates.length - 1;
        if (!error.retryable || !hasFallback) throw error;
        console.info(JSON.stringify({
          event: "ai_fallback_selected",
          requestId,
          failedModel: modelId,
          fallbackModel: modelCandidates[attemptIndex + 1],
          category: error.category,
        }));
      }
    }

    if (!data || !parsed) {
      throw lastGatewayError ?? new Error("AI did not return a report");
    }

    // Re-shape financials.capEx totals into the client shape
    const baseReport = {
      reportId: `CAI-${new Date().getFullYear()}-${crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`,
      dateIssued: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      classification: "Confidential",
      preparedBy: "Concept AI",
      methodology: "FMART-O 6-Dimension Weighted Scoring",
      executiveSummary: parsed.executiveSummary,
      scores: parsed.scores,
      market: parsed.market,
      customer: parsed.customer,
      competitors: parsed.competitors,
      research: {
        ...parsed.research,
        citations: publicResearch.citations,
        coverage: publicResearch.coverage,
        coverageMethod: "Source quality, recency, direct claim support, and independent domains.",
        coverageMetrics: publicResearch.coverageMetrics,
      },
      financials: {
        currency: parsed.financials.currency,
        projectType: parsed.financials.projectType,
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
      // Pass through model-provided evidence layer; ensureEvidenceFields fills any gaps.
      inputQualityScore: parsed.inputQualityScore,
      inputCompleteness: parsed.inputCompleteness,
      evidenceMix: parsed.evidenceMix,
      scoreExplanation: parsed.scoreExplanation,
      claimEvidenceMap: parsed.claimEvidenceMap,
    };

    const generationTimestamp = new Date().toISOString();
    failureCategory = "canonical_validation";
    const canonical = buildCanonicalReport(baseReport, inputs, {
      modelId,
      promptVersion,
      inputHash: `sha256:${inputHash}`,
      generationTimestamp,
      researchTimestamp: publicResearch.generatedAt,
      inputOrigins,
      serverInputClassification: validated.classification,
      inputWarningCodes: validated.issues.map((issue) => issue.code),
    });
    const report = deepSanitize(canonical);

    if (report.scoringAudit?.difference !== null && Math.abs(report.scoringAudit.difference) > 0.01) {
      console.warn(JSON.stringify({
        event: "score_mismatch",
        requestId,
        difference: report.scoringAudit.difference,
        scoringEngineVersion: report.scoringAudit.scoringEngineVersion,
      }));
    }
    if (report.qualityMetadata?.financialWarningCount > 0) {
      console.warn(JSON.stringify({
        event: "financial_validation_warning",
        requestId,
        warningCount: report.qualityMetadata.financialWarningCount,
      }));
    }

    const { data: completionAccepted, error: completionError } = requestId
      ? await supabaseAuth.rpc("complete_analysis_request", {
          p_request_id: requestId,
          p_completion_status: "completed",
          p_model_id: modelId,
          p_prompt_version: promptVersion,
          p_usage_metadata: safeUsageMetadata(data.usage),
          p_research_status: researchStatus,
          p_failure_category: null,
        })
      : { data: true, error: null };
    if (completionError || completionAccepted !== true) {
      failureCategory = "usage_logging";
      console.error(JSON.stringify({ event: "analysis_completion_log_failed", requestId }));
      throw new Error("Analysis completion could not be recorded");
    }
    console.info(JSON.stringify({
      event: "analysis_completed",
      requestId,
      validationStatus: report.validationStatus,
      sourceCount: report.qualityMetadata?.sourceCount ?? 0,
      unsupportedClaimCount: report.qualityMetadata?.unsupportedClaimCount ?? 0,
    }));
    requestId = null;

    return new Response(JSON.stringify(report), { headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
  } catch (e) {
    const gatewayError = e instanceof GatewayAttemptError ? e : null;
    if (gatewayError) failureCategory = gatewayError.category;
    else if (e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError")) failureCategory = "ai_timeout";

    if (requestId && requestClient) {
      try {
        await requestClient.rpc("complete_analysis_request", {
          p_request_id: requestId,
          p_completion_status: "failed",
          p_model_id: modelIdForLog,
          p_prompt_version: "concept-ai-2026-07-19.2",
          p_usage_metadata: {},
          p_research_status: researchStatus,
          p_failure_category: failureCategory,
        });
      } catch (_) {
        console.warn(JSON.stringify({ event: "analysis_failure_log_failed", requestId }));
      }
    }

    const safeError = gatewayError
      ? safeGatewayUserError(gatewayError)
      : failureCategory === "ai_timeout"
        ? { status: 504, message: "The analysis took too long. Please retry." }
        : { status: 500, message: "Analysis failed unexpectedly. Please try again." };
    console.error(JSON.stringify({ event: "analysis_failed", requestId, category: failureCategory }));
    return new Response(JSON.stringify({ error: safeError.message, requestId }), {
      status: safeError.status,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
});
