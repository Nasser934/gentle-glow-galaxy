import {
  claimSourceCoverage,
  resolvedScenarioCompleteness,
  type ResolvedConcept,
} from "./ai/schemas/resolved-concept.schema.ts";
import {
  governedStageInstruction,
  type PromptStage,
} from "./ai/promptManifest.ts";
import { computeVerdict } from "./evidence.ts";

// Shared analysis core — extracted verbatim from analyze-concept so the
// synchronous function and the async job worker use identical research,
// prompts, schema and report shaping. Do not change prompt or schema content.
const textFrom = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;

// Per-IP rate limiting (in-memory; resets on cold start). Protects against budget abuse.
const RATE_LIMIT_MAX = 8;        // requests per window per IP
const RATE_LIMIT_WINDOW_MS = 60_000 * 10; // 10 minutes
const ipHits = new Map<string, number[]>();
function rateLimit(ip: string): { ok: boolean; retryAfter?: number } {
  const now = Date.now();
  const arr = (ipHits.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (arr.length >= RATE_LIMIT_MAX) {
    return { ok: false, retryAfter: Math.ceil((RATE_LIMIT_WINDOW_MS - (now - arr[0])) / 1000) };
  }
  arr.push(now);
  ipHits.set(ip, arr);
  if (ipHits.size > 5000) {
    // Prevent unbounded growth
    for (const [k, v] of ipHits) if (v.every((t) => now - t > RATE_LIMIT_WINDOW_MS)) ipHits.delete(k);
  }
  return { ok: true };
}

// Server-side input length caps (defense in depth — clients also enforce maxLength).
const MAX_FIELD_LEN = 3000;
const MAX_TOTAL_LEN = 18000;
function sanitizeInputs(raw: Record<string, unknown>): { ok: true; inputs: Record<string, string> } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Invalid inputs payload" };
  const cleaned: Record<string, string> = {};
  let total = 0;
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v !== "string") continue;
    const trimmed = v.slice(0, MAX_FIELD_LEN);
    cleaned[k] = trimmed;
    total += trimmed.length;
    if (total > MAX_TOTAL_LEN) return { ok: false, error: "Input too large" };
  }
  return { ok: true, inputs: cleaned };
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

// SSRF guard — reject private/loopback/link-local/metadata IPs
function isPrivateIp(ip: string): boolean {
  if (!ip) return true;
  if (ip === "127.0.0.1" || ip === "0.0.0.0" || ip === "::1") return true;
  if (ip.startsWith("169.254.")) return true; // link-local & cloud metadata
  if (ip.startsWith("10.")) return true;
  if (ip.startsWith("192.168.")) return true;
  const m = ip.match(/^172\.(\d+)\./);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  if (ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80:")) return true;
  return false;
}

async function isUrlSafe(url: string): Promise<boolean> {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const host = u.hostname;
    // Block obvious local hostnames
    if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
    // If host is already a literal IP, check directly
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":")) {
      return !isPrivateIp(host);
    }
    // Resolve DNS and reject if any A record is private
    try {
      const ips = await Deno.resolveDns(host, "A");
      if (!ips.length || ips.some(isPrivateIp)) return false;
    } catch { return false; }
    return true;
  } catch { return false; }
}

async function safeText(url: string) {
  if (!(await isUrlSafe(url))) return null;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "ConceptAIResearchBot/1.0", "Accept": "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(4000),
      redirect: "manual",
    });
    if (!res.ok) return null;
    const txt = await res.text();
    return txt.slice(0, 200_000);
  } catch (_) { return null; }
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTitle(html: string) {
  const m = html.match(/<title[^>]*>([^<]{3,200})<\/title>/i);
  return m ? m[1].trim() : null;
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
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) { console.warn("Tavily HTTP", res.status); return null; }
    return await res.json();
  } catch (e) { console.warn("Tavily err", e); return null; }
}

async function scrapeCompetitors(rawUrls: string) {
  const urls = (rawUrls || "")
    .split(/[\s,]+/).map((u) => u.trim()).filter(Boolean)
    .filter((u) => /^https?:\/\//i.test(u)).slice(0, 4);
  if (!urls.length) return [];
  const out: Array<{ url: string; title: string | null; excerpt: string }> = [];
  await Promise.all(urls.map(async (url) => {
    const html = await safeText(url);
    if (!html) return;
    out.push({
      url,
      title: extractTitle(html),
      excerpt: stripHtml(html).slice(0, 1200),
    });
  }));
  return out;
}

/**
 * @deprecated Final reports use the durable deep-research engine in
 * researchAgent.ts. This private helper remains temporarily for source-level
 * rollback only and is not exported or called by any runtime entry point.
 */
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
    scrapeCompetitors(inputs.competitorUrls || ""),
  ]);

  const citations: Array<{ title: string; url: string; source: string; takeaway: string }> = [];
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
    citations.push({ title, source: "Tavily web", url, takeaway: snippet || "Web search citation." });
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
    citations.push({
      title, source: `Reddit · r/${subreddit}`,
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

  // Competitor scrapes — directly cited
  for (const c of competitors) {
    citations.push({
      title: c.title || c.url,
      source: "User-supplied competitor",
      url: c.url,
      takeaway: c.excerpt.slice(0, 240),
    });
    webSignals.push(`${c.title || c.url} — homepage excerpt: ${c.excerpt.slice(0, 220)}`);
  }

  const hasGroundedSearch = !!tavily;
  return {
    query, generatedAt: new Date().toISOString(),
    redditSignals: redditSignals.slice(0, 8),
    webSignals: webSignals.slice(0, 14),
    citations: citations.slice(0, 16),
    competitorScrapes: competitors,
    coverage: hasGroundedSearch && citations.length >= 6 ? "High"
            : citations.length >= 6 ? "Medium"
            : citations.length >= 2 ? "Low" : "Limited",
    grounded: hasGroundedSearch,
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
          description: "FMART dimension weights as decimals 0-1, summing to 1.0. Adapt to industry: capex-heavy projects weight Financial+Risk higher; tech startups weight Market+Timing higher.",
          properties: {
            financial: { type: "number" }, market: { type: "number" }, achievability: { type: "number" },
            risk: { type: "number" }, timing: { type: "number" }, operational: { type: "number" },
          },
          required: ["financial","market","achievability","risk","timing","operational"],
          additionalProperties: false,
        },
        confidence: {
          type: "object",
          description: "Per-dimension analyst confidence 0-100 (% certain). Lower this where research evidence is thin.",
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

    inputQualityScore: {
      type: "number",
      description:
        "Backward-compatible Brief Clarity score for user-owned/private fields only. Public research fields are excluded.",
    },
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
      description: "One row per FMART + Operational dimension (6 total).",
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
      description: "Key report claims, each with mix percentages summing to 100 and a confidence band.",
      items: {
        type: "object",
        properties: {
          claimId: { type: "string" },
          claimText: { type: "string" },
          reportSection: { type: "string" },
          userInputPercent: { type: "number" },
          webResearchPercent: { type: "number" },
          aiAssumptionPercent: { type: "number" },
          confidence: { type: "string", enum: ["High","Medium","Low"] },
          sources: { type: "array", items: { type: "string" } },
          userCanImproveBy: { type: "string" },
        },
        required: ["claimId","claimText","reportSection","userInputPercent","webResearchPercent","aiAssumptionPercent","confidence","sources","userCanImproveBy"],
        additionalProperties: false,
      },
    },
  },
  required: ["executiveSummary","scores","market","customer","competitors","research","financials","risks","fundingMix","fundingAdvisory","recommendations","nextSteps"],
  additionalProperties: false,
};

export type ReportPartKey = "decision" | "market" | "financial" | "actions";

const reportProperties = (reportSchema as { properties: Record<string, unknown> }).properties;

function createPartSchema(keys: string[]) {
  return {
    type: "object",
    properties: Object.fromEntries(keys.map((key) => [key, reportProperties[key]])),
    required: keys,
    additionalProperties: false,
  };
}

export const REPORT_PARTS = [
  {
    key: "market" as const,
    label: "Market and customer analysis",
    keys: ["market", "customer", "competitors", "research"],
  },
  {
    key: "financial" as const,
    label: "Financial model and risks",
    keys: ["financials", "risks", "fundingMix", "fundingAdvisory"],
  },
  {
    key: "decision" as const,
    label: "Scoring and decision",
    keys: ["executiveSummary", "scores", "evidenceMix", "scoreExplanation"],
  },
  {
    key: "actions" as const,
    label: "Recommendations and evidence map",
    keys: ["recommendations", "nextSteps", "claimEvidenceMap"],
  },
].map((part) => ({ ...part, schema: createPartSchema(part.keys) }));


export function mergeReportParts(generationParts: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const part of REPORT_PARTS) {
    const value = generationParts[part.key];
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`Missing persisted report part: ${part.key}`);
    }
    Object.assign(merged, value);
  }
  return merged;
}

const approximatelyEqual = (actual: number, expected: number) =>
  Math.abs(actual - expected) <= Math.max(0.01, Math.abs(expected) * 0.000001);

function monetaryMagnitude(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const match = value
    .toUpperCase()
    .replace(/,/g, "")
    .match(/(-?\d+(?:\.\d+)?)\s*(BILLION|MILLION|THOUSAND|B|M|K)?\b/);
  if (!match) return null;
  const numeric = Number(match[1]);
  if (!Number.isFinite(numeric)) return null;
  const multiplier = {
    BILLION: 1_000_000_000,
    B: 1_000_000_000,
    MILLION: 1_000_000,
    M: 1_000_000,
    THOUSAND: 1_000,
    K: 1_000,
  }[match[2] ?? ""] ?? 1;
  return numeric * multiplier;
}

export function validateMarketSizing(report: Record<string, any>): void {
  const tam = monetaryMagnitude(report?.market?.tamValue);
  const sam = monetaryMagnitude(report?.market?.samValue);
  const som = monetaryMagnitude(report?.market?.somValue);
  if (tam != null && sam != null && som != null && !(tam >= sam && sam >= som)) {
    throw new Error("Market values must satisfy TAM >= SAM >= SOM.");
  }
}

/**
 * Rejects internally inconsistent analyst arithmetic so the worker's existing
 * stage retry can regenerate the affected persisted part.
 */
export function validateFinancialArithmetic(report: Record<string, any>): void {
  const financials = report.financials;
  if (!financials || typeof financials !== "object") {
    throw new Error("Financial section is missing.");
  }
  const capEx = Array.isArray(financials.capEx) ? financials.capEx : [];
  if (capEx.length === 0) throw new Error("CapEx items are missing.");

  const numeric = (value: unknown, label: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new Error(`${label} is not numeric.`);
    return parsed;
  };
  const itemLow = capEx.reduce(
    (sum: number, item: any) => sum + numeric(item?.low, "CapEx item low"),
    0,
  );
  const itemHigh = capEx.reduce(
    (sum: number, item: any) => sum + numeric(item?.high, "CapEx item high"),
    0,
  );
  const totalLow = numeric(financials.capExLow, "CapEx low total");
  const totalHigh = numeric(financials.capExHigh, "CapEx high total");
  const totalMid = numeric(financials.capExMid, "CapEx midpoint");
  if (!approximatelyEqual(totalLow, itemLow)) {
    throw new Error("CapEx low total does not match its item total.");
  }
  if (!approximatelyEqual(totalHigh, itemHigh)) {
    throw new Error("CapEx high total does not match its item total.");
  }
  if (!approximatelyEqual(totalMid, (totalLow + totalHigh) / 2)) {
    throw new Error("CapEx midpoint does not match the low/high midpoint.");
  }
  if (totalLow > totalMid || totalMid > totalHigh) {
    throw new Error("CapEx totals must satisfy low <= midpoint <= high.");
  }

  for (const item of Array.isArray(financials.opEx) ? financials.opEx : []) {
    const monthly = numeric(item?.monthly, "Monthly OpEx");
    const annual = numeric(item?.annual, "Annual OpEx");
    if (!approximatelyEqual(annual, monthly * 12)) {
      throw new Error("Each annual OpEx value must equal monthly OpEx multiplied by 12.");
    }
  }

  const marketCurrency = String(report?.market?.currency ?? "").trim().toUpperCase();
  const financialCurrency = String(financials.currency ?? "").trim().toUpperCase();
  if (
    marketCurrency &&
    financialCurrency &&
    marketCurrency !== financialCurrency
  ) {
    throw new Error("Market and financial currency values must match.");
  }

  validateMarketSizing(report);
}

/** Validate each model section before it is persisted, so retries regenerate
 * the section that produced the inconsistent values. */
export function validateGeneratedPart(
  partKey: ReportPartKey,
  generationParts: Record<string, unknown>,
): void {
  const marketPart = generationParts.market &&
      typeof generationParts.market === "object"
    ? generationParts.market as Record<string, unknown>
    : {};
  if (partKey === "market") {
    validateMarketSizing(marketPart as Record<string, any>);
    return;
  }
  if (partKey === "financial") {
    const financialPart = generationParts.financial &&
        typeof generationParts.financial === "object"
      ? generationParts.financial as Record<string, unknown>
      : {};
    validateFinancialArithmetic({
      ...marketPart,
      ...financialPart,
    } as Record<string, any>);
  }
}

export function validateMergedReport(report: Record<string, unknown>): void {
  const requiredKeys = REPORT_PARTS.flatMap((part) => part.keys);
  const missing = requiredKeys.filter(
    (key) => !(key in report) || report[key] === null || report[key] === undefined,
  );
  if (missing.length > 0) {
    throw new Error(`Merged report is missing fields: ${missing.join(", ")}`);
  }
  if (
    !report.scores || typeof report.scores !== "object" ||
    !report.financials || typeof report.financials !== "object"
  ) {
    throw new Error("Merged report has invalid core sections.");
  }
  validateFinancialArithmetic(report as Record<string, any>);
}

export function buildPrompts(
  inputs: Record<string, string>,
  publicResearch: unknown,
  resolvedConcept: ResolvedConcept | null = null,
) {
  const systemPrompt = governedStageInstruction("report-editor");
  const userPrompt = JSON.stringify(
    {
      originalInputs: inputs,
      researchSnapshot: publicResearch,
      resolvedConcept,
    },
    null,
    2,
  );
  return { systemPrompt, userPrompt };
}

const PART_PROMPT_STAGE: Record<ReportPartKey, PromptStage> = {
  market: "market-analyst",
  financial: "financial-analyst",
  decision: "decision-analyst",
  actions: "actions-analyst",
};

export function buildPartPrompts(
  inputs: Record<string, string>,
  publicResearch: unknown,
  part: { key: ReportPartKey; label: string; keys: string[] },
  previousParts: Record<string, unknown> = {},
  resolvedConcept: ResolvedConcept | null = null,
) {
  const systemPrompt = governedStageInstruction(PART_PROMPT_STAGE[part.key]);
  const partInstruction = [
    `Generate the persisted "${part.label}" section.`,
    `Return only these top-level fields: ${part.keys.join(", ")}.`,
    "Treat previous sections as authoritative and do not recreate their fields.",
    "Do not omit any field required by the supplied schema.",
  ].join("\n");
  const userPrompt = JSON.stringify(
    {
      originalInputs: inputs,
      researchSnapshot: publicResearch,
      resolvedConcept,
      previousAuthoritativeParts: previousParts,
      currentSection: {
        key: part.key,
        label: part.label,
        outputFields: part.keys,
      },
    },
    null,
    2,
  );

  return {
    systemPrompt: `${systemPrompt}\n${partInstruction}`,
    userPrompt,
  };
}

const FMART_DIMENSIONS = [
  "financial",
  "market",
  "achievability",
  "risk",
  "timing",
  "operational",
] as const;

function clampScore(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(10, Math.max(0, parsed));
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

export function verdictFromScore(
  score: number,
): "PROCEED" | "PROCEED WITH CAUTION" | "REVISE" | "DO NOT PROCEED" {
  if (score >= 7.5) return "PROCEED";
  if (score >= 6.0) return "PROCEED WITH CAUTION";
  if (score >= 4.5) return "REVISE";
  return "DO NOT PROCEED";
}

function normalizeWeights(raw: Record<string, unknown>): Record<string, number> {
  const parsed = Object.fromEntries(
    FMART_DIMENSIONS.map((dimension) => [
      dimension,
      Math.max(0, Number(raw?.[dimension] ?? 0)),
    ]),
  ) as Record<string, number>;

  const sum = FMART_DIMENSIONS.reduce((total, dimension) => total + parsed[dimension], 0);
  if (!Number.isFinite(sum) || sum <= 0) {
    return {
      financial: 0.2,
      market: 0.2,
      achievability: 0.15,
      risk: 0.15,
      timing: 0.15,
      operational: 0.15,
    };
  }

  const normalized = Object.fromEntries(
    FMART_DIMENSIONS.map((dimension) => [dimension, parsed[dimension] / sum]),
  ) as Record<string, number>;

  // Correct floating-point drift while keeping the model's relative weighting.
  const normalizedSum = FMART_DIMENSIONS.reduce(
    (total, dimension) => total + normalized[dimension],
    0,
  );
  normalized.operational += 1 - normalizedSum;
  return normalized;
}

function confidenceCapForQuality(qualityScore: number) {
  if (qualityScore >= 75) return { market: 95, timing: 95, financial: 95, other: 95 };
  if (qualityScore >= 50) return { market: 78, timing: 75, financial: 78, other: 85 };
  if (qualityScore >= 25) return { market: 60, timing: 58, financial: 62, other: 75 };
  return { market: 45, timing: 42, financial: 50, other: 65 };
}

/** Normalize a confidence value of any scale (0-1, 0-10, 0-100) to a percentage. */
export function toConfidencePercent(raw: unknown): number | null {
  if (raw == null) return null;
  let n = typeof raw === "string" ? parseFloat(raw.replace(/[%,\s]/g, "")) : Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n < 0) n = 0;
  if (n > 0 && n <= 1) n = n * 100;
  else if (n > 1 && n <= 10) n = n * 10;
  while (n > 100) n = n / 10;
  return Math.round(n);
}

export type DecisionReadinessStatus =
  | "READY"
  | "NEEDS VALIDATION"
  | "INSUFFICIENT EVIDENCE";

export function decisionReadinessStatus(score: number): DecisionReadinessStatus {
  if (score >= 7.5) return "READY";
  if (score >= 5.0) return "NEEDS VALIDATION";
  return "INSUFFICIENT EVIDENCE";
}

/**
 * Evidence-readiness signal. Deliberately separate from the FMART-O feasibility
 * score: weak evidence lowers readiness, never `scores.overall`.
 */
export function computeDecisionReadiness(
  report: any,
  researchQualityScore: number,
): { decisionReadinessScore: number; decisionReadinessStatus: DecisionReadinessStatus } {
  const confidence = report?.scores?.confidence && typeof report.scores.confidence === "object"
    ? report.scores.confidence
    : {};
  const confidenceValues = Object.values(confidence)
    .map((value) => toConfidencePercent(value))
    .filter((value): value is number => value != null);
  const averageConfidence = confidenceValues.length > 0
    ? confidenceValues.reduce((total, value) => total + value, 0) / confidenceValues.length
    : 0;

  const research = Math.max(0, Math.min(100, Number(researchQualityScore) || 0));
  const claimCoverage = claimSourceCoverage(report);
  const scenarioCompleteness = resolvedScenarioCompleteness(
    report?.resolvedConcept as ResolvedConcept | null | undefined,
  );
  const highImpactPrivateDecisions = Array.isArray(
    report?.resolvedConcept?.unresolvedPrivateDecisions,
  )
    ? report.resolvedConcept.unresolvedPrivateDecisions.filter(
      (decision: any) => decision?.decisionImpact === "high",
    ).length
    : 0;
  const privateDecisionPenalty = Math.min(24, highImpactPrivateDecisions * 8);

  const score = roundOne(
    (
      research * 0.35 +
      averageConfidence * 0.25 +
      claimCoverage * 0.25 +
      scenarioCompleteness * 0.15 -
      privateDecisionPenalty
    ) / 10,
  );
  const bounded = Math.max(0, Math.min(10, score));
  return {
    decisionReadinessScore: bounded,
    decisionReadinessStatus: decisionReadinessStatus(bounded),
  };
}

/**
 * Builds the display recommendation only after the authoritative FMART-O
 * score, confidence caps, and readiness signal exist. Brief Clarity is
 * deliberately absent from this calculation.
 */
export function buildDecisionSummary(report: any) {
  const confidenceValues = Object.values(
    report?.scores?.confidence && typeof report.scores.confidence === "object"
      ? report.scores.confidence
      : {},
  )
    .map((value) => toConfidencePercent(value))
    .filter((value): value is number => value != null);
  const overallConfidencePct = confidenceValues.length > 0
    ? Math.round(
      confidenceValues.reduce((total, value) => total + value, 0) /
        confidenceValues.length,
    )
    : 0;
  const citations = Array.isArray(report?.research?.citations)
    ? report.research.citations
    : [];
  const financialsMissing =
    !report?.financials?.breakEvenSummary ||
    !report?.financials?.ltvCacRatio;
  const criticalRisksWithoutMitigation = Array.isArray(report?.risks) &&
    report.risks.some((risk: any) => {
      const isHigh = /high|critical/i.test(
        `${risk?.level ?? ""} ${risk?.impact ?? ""}`,
      );
      const mitigation = String(risk?.mitigation ?? "").trim();
      return isHigh && mitigation.length < 12;
    });

  const decision = computeVerdict({
    score: Number(report?.scores?.overall ?? 0),
    overallConfidencePct,
    aiAssumptionPct: Number(report?.evidenceMix?.aiAssumptionPercent ?? 0),
    marketEvidenceWeak: citations.length < 3 || claimSourceCoverage(report) < 50,
    financialsMissing,
    criticalRisksWithoutMitigation,
  });
  const unresolvedHigh = Array.isArray(
    report?.resolvedConcept?.unresolvedPrivateDecisions,
  )
    ? report.resolvedConcept.unresolvedPrivateDecisions.filter(
      (item: any) => item?.decisionImpact === "high",
    )
    : [];

  if (unresolvedHigh.length > 0) {
    decision.blockers.push(
      `${unresolvedHigh.length} high-impact private decision${unresolvedHigh.length === 1 ? "" : "s"} still need confirmation.`,
    );
    decision.nextStepHint = String(
      unresolvedHigh[0]?.userAction ||
        "Confirm the unresolved private decisions before commitment.",
    );
  }

  return {
    ...decision,
    blockers: Array.from(new Set(decision.blockers)),
  };
}

/**
 * Deterministic server-side finalization. Research quality can only lower
 * confidence and evidence-mix claims — never the FMART-O score itself.
 */
export function finalizeReportDeterministically(
  report: any,
  researchQuality: { score?: number; level?: string } | null | undefined,
): any {
  const output = structuredClone(report ?? {});
  if (!output.scores || typeof output.scores !== "object") {
    throw new Error("Report scores are missing.");
  }

  const weights = normalizeWeights(output.scores.weights ?? {});
  output.scores.weights = weights;
  for (const dimension of FMART_DIMENSIONS) {
    output.scores[dimension] = clampScore(output.scores[dimension]);
  }

  const overall = roundOne(
    FMART_DIMENSIONS.reduce(
      (total, dimension) => total + output.scores[dimension] * weights[dimension],
      0,
    ),
  );
  output.scores.overall = overall;
  output.scores.verdict = verdictFromScore(overall);

  const qualityScore = Math.max(0, Math.min(100, Number(researchQuality?.score ?? 0)));
  const caps = confidenceCapForQuality(qualityScore);
  const confidence = output.scores.confidence && typeof output.scores.confidence === "object"
    ? output.scores.confidence
    : {};

  confidence.market = Math.min(Number(confidence.market ?? 0), caps.market);
  confidence.timing = Math.min(Number(confidence.timing ?? 0), caps.timing);
  confidence.financial = Math.min(Number(confidence.financial ?? 0), caps.financial);
  confidence.achievability = Math.min(Number(confidence.achievability ?? 0), caps.other);
  confidence.risk = Math.min(Number(confidence.risk ?? 0), caps.other);
  confidence.operational = Math.min(Number(confidence.operational ?? 0), caps.other);
  output.scores.confidence = confidence;

  if (output.research && typeof output.research === "object") {
    output.research.confidence = qualityScore >= 75 ? "High" : qualityScore >= 50 ? "Medium" : "Low";
  }

  if (output.evidenceMix && typeof output.evidenceMix === "object") {
    const maxWebPercent = qualityScore >= 75
      ? 50
      : qualityScore >= 50
        ? 38
        : qualityScore >= 25
          ? 25
          : 15;
    const currentWeb = Math.max(0, Number(output.evidenceMix.webResearchPercent ?? 0));
    const cappedWeb = Math.min(currentWeb, maxWebPercent);
    const userPercent = Math.max(0, Number(output.evidenceMix.userInputPercent ?? 0));
    const boundedUser = Math.min(userPercent, 100 - cappedWeb);
    output.evidenceMix = {
      userInputPercent: Math.round(boundedUser),
      webResearchPercent: Math.round(cappedWeb),
      aiAssumptionPercent: Math.max(
        0,
        100 - Math.round(boundedUser) - Math.round(cappedWeb),
      ),
    };
  }

  if (Array.isArray(output.scoreExplanation)) {
    for (const row of output.scoreExplanation) {
      const dimension = String(row?.dimension ?? "");
      if ((FMART_DIMENSIONS as readonly string[]).includes(dimension)) {
        row.score = output.scores[dimension];
      }
    }
  }

  // New-format claim citations may reference only IDs saved in the research
  // snapshot. Legacy reports without source IDs remain untouched.
  const allowedSourceIds = new Set<string>(
    (Array.isArray(output?.research?.citations) ? output.research.citations : [])
      .map((citation: any) => String(citation?.id ?? "").trim())
      .filter(Boolean),
  );
  if (allowedSourceIds.size > 0 && Array.isArray(output.claimEvidenceMap)) {
    output.claimEvidenceMap = output.claimEvidenceMap.map((claim: any) => ({
      ...claim,
      sources: Array.isArray(claim?.sources)
        ? claim.sources
          .map((source: unknown) => String(source))
          .filter((source: string) => allowedSourceIds.has(source))
        : [],
    }));
  }

  // Additive, deterministic evidence-readiness signal (never affects FMART-O).
  const readiness = computeDecisionReadiness(output, qualityScore);
  output.decisionReadinessScore = readiness.decisionReadinessScore;
  output.decisionReadinessStatus = readiness.decisionReadinessStatus;
  output.decision = buildDecisionSummary(output);

  return output;
}



export function buildBaseReport(
  parsed: any,
  publicResearch: any,
  resolvedConcept: ResolvedConcept | null = null,
) {
  const baseReport: any = {
    reportId: `FSB-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
    dateIssued: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
    classification: "Confidential",
    preparedBy: "AI Feasibility Engine v2.1",
    methodology: "FMART-O 6-Dimension Weighted Scoring",
    executiveSummary: parsed.executiveSummary,
    scores: parsed.scores,
    market: parsed.market,
    customer: parsed.customer,
    competitors: parsed.competitors,
    research: {
      ...parsed.research,
      citations: publicResearch.citations,
    },
    ...(resolvedConcept ? { resolvedConcept } : {}),
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
    // Pass through model-provided evidence layer; ensureEvidenceFields fills any gaps.
    inputQualityScore: parsed.inputQualityScore,
    inputCompleteness: parsed.inputCompleteness,
    evidenceMix: parsed.evidenceMix,
    scoreExplanation: parsed.scoreExplanation,
    claimEvidenceMap: parsed.claimEvidenceMap,
  };
  return baseReport;
}

export { textFrom, rateLimit, sanitizeInputs, reportSchema };
