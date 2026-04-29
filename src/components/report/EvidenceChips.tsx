// Phase 10 — Inline evidence chips: surface the most relevant research citations
// next to a piece of text by matching keywords in the citation title/takeaway.
import { ExternalLink } from "lucide-react";
import type { ResearchCitation } from "@/types/analysis";

const STOP = new Set([
  "the","and","for","with","from","this","that","into","over","under","about","their","they",
  "have","will","your","you","our","but","not","are","was","were","is","of","in","to","a","an",
  "on","by","as","at","be","or","it","its","than","then","also","more","very","such","most",
]);

function tokenize(text: string) {
  return Array.from(
    new Set(
      (text || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 4 && !STOP.has(w)),
    ),
  );
}

export function relevantCitations(text: string, citations: ResearchCitation[] | undefined, max = 2) {
  if (!citations?.length || !text) return [];
  const tokens = tokenize(text);
  if (!tokens.length) return [];
  const scored = citations
    .map((c) => {
      const hay = `${c.title} ${c.takeaway}`.toLowerCase();
      const score = tokens.reduce((acc, t) => (hay.includes(t) ? acc + 1 : acc), 0);
      return { c, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, max);
  return scored.map((s) => s.c);
}

export const EvidenceChips = ({
  text,
  citations,
  max = 2,
}: { text: string; citations?: ResearchCitation[]; max?: number }) => {
  const matches = relevantCitations(text, citations, max);
  if (!matches.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {matches.map((c, i) => (
        <a
          key={c.url + i}
          href={c.url}
          target="_blank"
          rel="noreferrer"
          title={`${c.source} — ${c.takeaway}`}
          className="inline-flex max-w-[220px] items-center gap-1 truncate rounded-full border border-primary/25 bg-primary/5 px-2 py-0.5 text-[10px] font-medium text-primary transition-colors hover:bg-primary/10"
        >
          <ExternalLink className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate">{c.source}</span>
        </a>
      ))}
    </div>
  );
};
