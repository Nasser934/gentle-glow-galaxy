import type { ConceptInputs, FeasibilityReport, ResearchCitation } from "@/types/analysis";
import { supabase } from "@/integrations/supabase/client";

export async function enrichReportResearch(inputs: ConceptInputs, report: FeasibilityReport): Promise<FeasibilityReport> {
  const existing = report.research?.citations ?? [];
  if (existing.some((item) => item.url || item.title)) return report;

  try {
    const { data, error } = await supabase.functions.invoke("tavily-research", { body: { inputs } });
    if (error || !Array.isArray(data?.citations)) return report;

    const citations = (data.citations as ResearchCitation[])
      .filter((item) => item.url && item.title)
      .slice(0, 8);
    if (citations.length === 0) return report;

    return {
      ...report,
      research: {
        overview: report.research?.overview || data.answer || "Research supports the market, competitor, and validation context.",
        confidence: citations.length >= 5 ? "High" : "Medium",
        sentiment: report.research?.sentiment ?? "Mixed",
        keySignals: report.research?.keySignals ?? [],
        painPoints: report.research?.painPoints ?? [],
        competitorMentions: report.research?.competitorMentions ?? [],
        redditSignals: report.research?.redditSignals ?? [],
        webSignals: report.research?.webSignals ?? [],
        citations,
      },
    };
  } catch {
    return report;
  }
}
