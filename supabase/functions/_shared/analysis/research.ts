import type { SourceQuality } from "./evidence.ts";

export interface CitationCandidate {
  title: string;
  url: string;
  source: string;
  takeaway: string;
  publisher?: string;
  publicationDate?: string | null;
  sourceType: "Verified market evidence" | "Community discussion" | "General background" | "Competitor-provided information";
  quality: SourceQuality;
}

export interface FinalizedCitation extends CitationCandidate {
  sourceId: string;
  domain: string;
  publisher: string;
  publicationDate: string | null;
  accessDate: string;
  stale: boolean;
}

export function canonicalizeUrl(raw: string) {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|ref$|source$)/i.test(key)) url.searchParams.delete(key);
    }
    url.hostname = url.hostname.toLowerCase();
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return "";
  }
}

export function domainForUrl(raw: string) {
  try { return new URL(raw).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}

export function stableSourceId(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `SRC-${(hash >>> 0).toString(16).padStart(8, "0").toUpperCase()}`;
}

export function qualityForWebDomain(domain: string): SourceQuality {
  if (/(^|\.)(gov|gov\.sa|gov\.ae|europa\.eu)$/.test(domain) || /(^|\.)(sama|sdaia)\.gov\.sa$/.test(domain)) {
    return "Government or regulator";
  }
  if (/\.edu$|\.ac\.[a-z]{2}$/.test(domain)) return "Academic or institutional";
  if (/(^|\.)(worldbank\.org|imf\.org|oecd\.org|who\.int|un\.org)$/.test(domain)) return "Academic or institutional";
  if (/(^|\.)(mckinsey\.com|gartner\.com|forrester\.com|weforum\.org)$/.test(domain)) return "Reputable industry research";
  return "General reference";
}

export function isStale(publicationDate: string | null | undefined, now = Date.now()) {
  if (!publicationDate) return false;
  const published = Date.parse(publicationDate);
  if (!Number.isFinite(published)) return false;
  return now - published > 1000 * 60 * 60 * 24 * 365 * 2;
}

function qualityRank(quality: SourceQuality) {
  return {
    "Primary official source": 8,
    "Government or regulator": 7,
    "Academic or institutional": 6,
    "Reputable industry research": 5,
    "Company source": 3,
    "General reference": 2,
    "Community signal": 1,
    "Unknown": 0,
  }[quality];
}

export function finalizeCitations(
  candidates: CitationCandidate[],
  options: { now?: number; maxPerDomain?: number; maxSources?: number } = {},
): FinalizedCitation[] {
  const now = options.now ?? Date.now();
  const unique = new Map<string, CitationCandidate>();
  for (const candidate of candidates) {
    const canonicalUrl = canonicalizeUrl(candidate.url);
    if (!canonicalUrl) continue;
    const current = unique.get(canonicalUrl);
    if (!current || qualityRank(candidate.quality) > qualityRank(current.quality)) {
      unique.set(canonicalUrl, { ...candidate, url: canonicalUrl });
    }
  }

  const domainCounts = new Map<string, number>();
  const accessDate = new Date(now).toISOString().slice(0, 10);
  return [...unique.values()]
    .sort((a, b) => qualityRank(b.quality) - qualityRank(a.quality))
    .filter((candidate) => {
      const domain = domainForUrl(candidate.url);
      const count = domainCounts.get(domain) ?? 0;
      if (count >= (options.maxPerDomain ?? 2)) return false;
      domainCounts.set(domain, count + 1);
      return true;
    })
    .slice(0, options.maxSources ?? 16)
    .map((candidate) => {
      const domain = domainForUrl(candidate.url);
      return {
        ...candidate,
        sourceId: stableSourceId(candidate.url),
        domain,
        publisher: candidate.publisher || domain || candidate.source || "Unknown",
        publicationDate: candidate.publicationDate ?? null,
        accessDate,
        stale: isStale(candidate.publicationDate, now),
      };
    });
}

export function assessCoverage(citations: FinalizedCitation[]) {
  const reliable = citations.filter((citation) =>
    ["Primary official source", "Government or regulator", "Academic or institutional", "Reputable industry research"].includes(citation.quality)
    && !citation.stale,
  );
  const independentReliableDomains = new Set(reliable.map((citation) => citation.domain)).size;
  const nonCommunity = citations.filter((citation) => citation.quality !== "Community signal");
  const coverage = reliable.length >= 4 && independentReliableDomains >= 3
    ? "Sufficient" as const
    : reliable.length >= 2 && independentReliableDomains >= 2
      ? "Partial" as const
      : nonCommunity.length > 0
        ? "Limited" as const
        : "No reliable external evidence" as const;
  return {
    coverage,
    reliableExternalEvidence: reliable.length > 0,
    metrics: {
      reliableSourceCount: reliable.length,
      independentReliableDomains,
      currentSourceCount: citations.filter((citation) => !citation.stale).length,
      directClaimSupportCount: 0,
    },
  };
}

export function isPrivateNetworkAddress(ip: string): boolean {
  const normalized = ip.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  if (!normalized) return true;
  if (normalized.includes(":")) {
    if (normalized === "::" || normalized === "::1") return true;
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
    if (/^fe[89ab]/.test(normalized) || normalized.startsWith("ff")) return true;
    if (normalized.startsWith("2001:db8")) return true;
    const mapped = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
    return mapped ? isPrivateNetworkAddress(mapped) : false;
  }

  const parts = normalized.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b, c] = parts;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)))) return true;
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  return false;
}

export function isBlockedHostname(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  return host === "localhost"
    || host.endsWith(".local")
    || host.endsWith(".internal")
    || host === "metadata.google.internal"
    || host === "metadata";
}

/**
 * Defense-in-depth validation for user-provided research URLs. Competitor
 * pages are extracted by Tavily rather than fetched from the Edge Function,
 * so these URLs can never address the application's own network.
 */
export function isPublicResearchUrl(raw: string) {
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return false;
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
    if (isBlockedHostname(host)) return false;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":")) {
      return !isPrivateNetworkAddress(host);
    }
    return host.includes(".") && host.length <= 253;
  } catch {
    return false;
  }
}
