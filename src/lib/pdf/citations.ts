// =============================================================================
// Phase 2 — Citation hygiene
// -----------------------------------------------------------------------------
// Clean, dedupe, and prioritise citations before they hit the PDF.
// Strips markdown noise, drops empty/garbage titles, caps to top N for the
// main report, and keeps the strongest source per URL.
// =============================================================================

export interface CleanCitation {
  /** Publisher / source label (e.g. "McKinsey", "SDAIA"). */
  source: string;
  /** Cleaned title — never empty after `cleanCitations`. */
  title: string;
  /** Original URL if present. Used for dedupe + appendix linking. */
  url: string;
  /** Cleaned takeaway / supported claim. */
  takeaway: string;
  /** Optional confidence/relevance bucket. */
  confidence?: "High" | "Medium" | "Low";
  /** Optional one-line claim this citation supports. */
  supports?: string;
}

const GARBAGE_TITLES = new Set<string>([
  "untitled", "n/a", "na", "tavily web", "web result", "search result",
  "tavily search", "result", "results", "source", "page", "—",
]);

const stripMarkdown = (raw: string): string =>
  String(raw || "")
    // backticks, bold/italic/strike, headings, blockquote/list markers
    .replace(/[`#*_~]+/g, "")
    .replace(/^\s*[-•*>+]+\s+/gm, "")
    // collapse newlines / tabs / repeated whitespace
    .replace(/\s+/g, " ")
    // strip stray bracket noise like "[1]" / "(source: …)"
    .replace(/\s*\[\d+\]\s*/g, " ")
    .trim();

const isGarbageTitle = (t: string): boolean => {
  if (!t || t.length < 3) return true;
  if (GARBAGE_TITLES.has(t.toLowerCase())) return true;
  if (/^[\.\-_]+$/.test(t)) return true;
  return false;
};

const normaliseSource = (src: string, url: string): string => {
  const s = stripMarkdown(src);
  if (s && !/^tavily/i.test(s) && !/^web( search)?$/i.test(s)) return s;
  // Fall back to URL hostname
  try {
    if (url) {
      const h = new URL(url).hostname.replace(/^www\./, "");
      return h || "Web";
    }
  } catch {/* ignore */}
  return s || "Web";
};

const dedupeKey = (c: { url?: string; title: string }): string => {
  const u = (c.url || "").toLowerCase().replace(/[#?].*$/, "").replace(/\/$/, "");
  return u || c.title.toLowerCase();
};

/**
 * Clean a raw citation array into a curated list.
 * - Strips markdown / bullets / whitespace noise.
 * - Drops empty or garbage titles.
 * - Drops entries with no meaningful takeaway.
 * - Dedupes by URL (or title when URL is missing).
 * - Caps to `limit` (default 7).
 */
export function cleanCitations(
  raw: unknown[] | null | undefined,
  limit = 7,
): CleanCitation[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const seen = new Set<string>();
  const out: CleanCitation[] = [];

  for (const c of raw) {
    if (!c || typeof c !== "object") continue;
    const r = c as Record<string, unknown>;

    const title = stripMarkdown(String(r.title || r.headline || ""));
    if (isGarbageTitle(title)) continue;

    const url = String(r.url || r.link || "").trim();
    const takeaway = stripMarkdown(
      String(r.takeaway || r.summary || r.snippet || r.description || ""),
    );
    if (!takeaway || takeaway.length < 12) continue;

    const source = normaliseSource(String(r.source || r.publisher || ""), url);
    const supports = stripMarkdown(String(r.supports || r.claim || "")) || undefined;
    const confRaw = String(r.confidence || r.relevance || "").toLowerCase();
    const confidence: CleanCitation["confidence"] | undefined = /high/.test(confRaw)
      ? "High"
      : /medium|med/.test(confRaw)
        ? "Medium"
        : /low/.test(confRaw)
          ? "Low"
          : undefined;

    const cleaned: CleanCitation = { source, title, url, takeaway, supports, confidence };
    const k = dedupeKey(cleaned);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(cleaned);
    if (out.length >= limit) break;
  }
  return out;
}
