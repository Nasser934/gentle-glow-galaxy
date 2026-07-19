import {
  assessCoverage,
  canonicalizeUrl,
  domainForUrl,
  finalizeCitations,
  isPublicResearchUrl,
  qualityForWebDomain,
  type CitationCandidate,
} from "./research.ts";

type RecordLike = Record<string, unknown>;

const textFrom = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const asRecord = (value: unknown): RecordLike => typeof value === "object" && value !== null ? value as RecordLike : {};
const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

async function safeJson(url: string, init?: RequestInit) {
  try {
    const response = await fetch(url, {
      ...init,
      headers: { "User-Agent": "ConceptAIResearchBot/1.0", ...(init?.headers || {}) },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function tavilySearch(query: string) {
  const key = Deno.env.get("TAVILY_API_KEY");
  if (!key) return null;
  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        query,
        search_depth: "basic",
        max_results: 8,
        include_answer: true,
        include_raw_content: false,
        time_range: "year",
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      console.warn(JSON.stringify({ event: "tavily_search_failed", status: response.status }));
      return null;
    }
    return await response.json();
  } catch (error) {
    console.warn(JSON.stringify({ event: "tavily_search_failed", error: error instanceof Error ? error.name : "unknown" }));
    return null;
  }
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
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
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
      console.warn(JSON.stringify({ event: "tavily_extract_failed", status: response.status }));
      return [];
    }
    const payload = asRecord(await response.json());
    return asArray(payload.results).flatMap((rawResult) => {
      const result = asRecord(rawResult);
      const url = canonicalizeUrl(textFrom(result.url));
      const excerpt = textFrom(result.raw_content).replace(/\s+/g, " ").trim().slice(0, 1_200);
      if (!url || !urls.includes(url) || !excerpt) return [];
      return [{ url, title: domainForUrl(url) || null, excerpt }];
    });
  } catch (error) {
    console.warn(JSON.stringify({ event: "tavily_extract_failed", error: error instanceof Error ? error.name : "unknown" }));
    return [];
  }
}

export async function fetchPublicResearch(inputs: Record<string, string>) {
  const query = [inputs.projectName, inputs.industry, inputs.location].filter(Boolean).join(" ").slice(0, 160);
  const tavilyQuery = [inputs.projectName, inputs.industry, inputs.location, "market size competitors"]
    .filter(Boolean)
    .join(" ")
    .slice(0, 200);
  const encoded = encodeURIComponent(query);

  const [redditRaw, hnRaw, wikiRaw, duckRaw, tavilyRaw, competitors] = await Promise.all([
    safeJson(`https://www.reddit.com/search.json?q=${encoded}&sort=relevance&limit=8`),
    safeJson(`https://hn.algolia.com/api/v1/search?query=${encoded}&tags=story&hitsPerPage=6`),
    safeJson(`https://en.wikipedia.org/w/api.php?action=opensearch&search=${encoded}&limit=5&format=json&origin=*`),
    safeJson(`https://api.duckduckgo.com/?q=${encoded}&format=json&no_html=1&skip_disambig=1`),
    tavilySearch(tavilyQuery),
    extractCompetitors(inputs.competitorUrls || ""),
  ]);

  const reddit = asRecord(redditRaw);
  const hn = asRecord(hnRaw);
  const duck = asRecord(duckRaw);
  const tavily = asRecord(tavilyRaw);
  const wiki = Array.isArray(wikiRaw) ? wikiRaw : [];
  const candidates: CitationCandidate[] = [];
  const redditSignals: string[] = [];
  const webSignals: string[] = [];

  const tavilyAnswer = textFrom(tavily.answer).trim();
  if (tavilyAnswer) webSignals.unshift(`Tavily synthesis: ${tavilyAnswer.slice(0, 320)}`);
  for (const rawResult of asArray(tavily.results).slice(0, 6)) {
    const result = asRecord(rawResult);
    const title = textFrom(result.title).trim();
    const rawUrl = textFrom(result.url);
    if (!title || !rawUrl) continue;
    const snippet = textFrom(result.content).slice(0, 260);
    const url = canonicalizeUrl(rawUrl);
    const domain = domainForUrl(url);
    const quality = qualityForWebDomain(domain);
    const sourceType = [
      "Primary official source",
      "Government or regulator",
      "Academic or institutional",
      "Reputable industry research",
    ].includes(quality)
      ? "Verified market evidence" as const
      : "General background" as const;
    webSignals.push(`${title} — ${snippet}`);
    candidates.push({
      title,
      source: "Web research",
      publisher: domain,
      url,
      takeaway: snippet || "Public web context; direct claim support must be checked.",
      publicationDate: textFrom(result.published_date) || null,
      sourceType,
      quality,
    });
  }

  const redditData = asRecord(reddit.data);
  for (const rawChild of asArray(redditData.children).slice(0, 8)) {
    const child = asRecord(rawChild);
    const post = asRecord(child.data);
    const title = textFrom(post.title).trim();
    if (!title) continue;
    const score = Number(post.score ?? 0);
    const comments = Number(post.num_comments ?? 0);
    const subreddit = textFrom(post.subreddit, "reddit");
    redditSignals.push(`${title} — r/${subreddit}, ${score} upvotes, ${comments} comments`);
    candidates.push({
      title,
      source: `Reddit · r/${subreddit}`,
      url: `https://www.reddit.com${textFrom(post.permalink, "/search")}`,
      takeaway: `Community signal with ${comments} comments and ${score} upvotes.`,
      publicationDate: post.created_utc ? new Date(Number(post.created_utc) * 1_000).toISOString() : null,
      sourceType: "Community discussion",
      quality: "Community signal",
    });
  }

  for (const rawHit of asArray(hn.hits).slice(0, 6)) {
    const hit = asRecord(rawHit);
    const title = textFrom(hit.title || hit.story_title).trim();
    if (!title) continue;
    const points = Number(hit.points ?? 0);
    const comments = Number(hit.num_comments ?? 0);
    const objectId = textFrom(hit.objectID);
    webSignals.push(`${title} — Hacker News, ${points} points, ${comments} comments`);
    candidates.push({
      title,
      source: "Hacker News",
      url: textFrom(hit.url, `https://news.ycombinator.com/item?id=${objectId}`),
      takeaway: `Community discussion signal with ${comments} comments.`,
      publicationDate: textFrom(hit.created_at) || null,
      sourceType: "Community discussion",
      quality: "Community signal",
    });
  }

  const wikiTitles = Array.isArray(wiki[1]) ? wiki[1] as unknown[] : [];
  const wikiUrls = Array.isArray(wiki[3]) ? wiki[3] as unknown[] : [];
  wikiTitles.slice(0, 5).forEach((rawTitle, index) => {
    const title = textFrom(rawTitle).trim();
    if (!title) return;
    webSignals.push(`${title} — Wikipedia/reference coverage`);
    candidates.push({
      title,
      source: "Wikipedia",
      url: textFrom(wikiUrls[index], "https://www.wikipedia.org"),
      takeaway: "General background only; not direct verification of a report figure.",
      sourceType: "General background",
      quality: "General reference",
    });
  });

  const abstract = textFrom(duck.AbstractText).trim();
  if (abstract) {
    webSignals.unshift(abstract.slice(0, 260));
    const abstractUrl = textFrom(duck.AbstractURL);
    if (abstractUrl) candidates.push({
      title: textFrom(duck.Heading, "Reference result"),
      source: textFrom(duck.AbstractSource, "DuckDuckGo reference"),
      url: abstractUrl,
      takeaway: abstract.slice(0, 260),
      sourceType: "General background",
      quality: "General reference",
    });
  }

  for (const competitor of competitors) {
    candidates.push({
      title: competitor.title || competitor.url,
      source: "Competitor-provided information",
      url: competitor.url,
      takeaway: competitor.excerpt.slice(0, 240),
      sourceType: "Competitor-provided information",
      quality: "Company source",
    });
    webSignals.push(`${competitor.title || competitor.url} — homepage excerpt: ${competitor.excerpt.slice(0, 220)}`);
  }

  const citations = finalizeCitations(candidates);
  const coverageAssessment = assessCoverage(citations);
  return {
    query,
    generatedAt: new Date().toISOString(),
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
