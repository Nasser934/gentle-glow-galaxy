import { ExternalLink } from "lucide-react";
import type { EvidenceSource, ResearchCitation } from "@/types/analysis";
import { prettifySource } from "@/lib/format";
import { safeExternalUrl } from "@/lib/safeUrl";

/** Resolve citations only through explicit stable source IDs. */
export function citationsForSourceIds(
  sourceIds: string[] | undefined,
  sources: EvidenceSource[] | undefined,
  citations: ResearchCitation[] | undefined,
  max = 2,
) {
  if (!sourceIds?.length) return [];
  const normalized = sources ?? (citations ?? [])
    .filter((citation) => citation.sourceId)
    .map((citation) => ({
      sourceId: citation.sourceId as string,
      title: citation.title,
      url: citation.url,
      domain: citation.domain || "",
      publisher: citation.publisher || citation.source,
      publicationDate: citation.publicationDate,
      accessDate: citation.accessDate || "",
      sourceType: citation.sourceType || "general",
      quality: citation.quality || "Unknown" as const,
      stale: citation.stale,
    }));
  const byId = new Map(normalized.map((source) => [source.sourceId, source]));
  return sourceIds.map((sourceId) => byId.get(sourceId)).filter((source): source is EvidenceSource => source !== undefined).slice(0, max);
}

export const EvidenceChips = ({
  sourceIds,
  sources,
  citations,
  max = 2,
}: {
  sourceIds?: string[];
  sources?: EvidenceSource[];
  citations?: ResearchCitation[];
  max?: number;
}) => {
  const matches = citationsForSourceIds(sourceIds, sources, citations, max);
  if (!matches.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {matches.map((source) => {
        const href = safeExternalUrl(source.url);
        if (!href) return null;
        const label = source.publisher || prettifySource({ title: source.title, url: source.url });
        return (
          <a
            key={source.sourceId}
            href={href}
            target="_blank"
            rel="noreferrer"
            title={`${label} — ${source.quality}`}
            className="inline-flex max-w-[220px] items-center gap-1 truncate rounded-full border border-primary/25 bg-primary/5 px-2 py-0.5 text-[10px] font-medium text-primary transition-colors hover:bg-primary/10"
          >
            <ExternalLink className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate">{label}</span>
          </a>
        );
      })}
    </div>
  );
};
