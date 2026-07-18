import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Loader2, GitCompare, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listMyReports, type ReportRow } from "@/lib/reports";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ConceptInputs, FeasibilityReport } from "@/types/analysis";
import { compactCurrencyString } from "@/lib/format";
import { ensureEvidenceFields } from "@/lib/evidence";
import { compareCanonicalReports } from "@/lib/reportComparison";


const dims = [
  { key: "financial", label: "Financial" },
  { key: "market", label: "Market" },
  { key: "achievability", label: "Achievability" },
  { key: "operational", label: "Operational" },
  { key: "risk", label: "Risk (inv.)" },
  { key: "timing", label: "Timing" },
  { key: "overall", label: "Overall" },
] as const;

type LoadedReport = { report: FeasibilityReport; inputs: ConceptInputs };
type ReportListRow = Pick<ReportRow, "id" | "slug" | "title" | "industry" | "status" | "created_at" | "updated_at" | "parent_report_id" | "archived_at">;

const Compare = () => {
  const [searchParams] = useSearchParams();
  const [rows, setRows] = useState<ReportListRow[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [loaded, setLoaded] = useState<Record<string, LoadedReport>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const pickedRef = useRef<string[]>([]);
  const loadedRef = useRef<Record<string, LoadedReport>>({});
  const pendingLoads = useRef(new Set<string>());

  const commitPicked = (next: string[]) => {
    pickedRef.current = next;
    setPicked(next);
  };

  const commitLoaded = (next: Record<string, LoadedReport>) => {
    loadedRef.current = next;
    setLoaded(next);
  };

  // Load all reports (active + archived) so deep links from the dashboard
  // can preselect even older versions.
  useEffect(() => {
    setLoading(true);
    setLoadError(false);
    listMyReports("all")
      .then(setRows)
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [retryKey]);

  // Preselect from ?ids=a,b[,c] — up to 3, fetched in parallel.
  useEffect(() => {
    const raw = searchParams.get("ids");
    if (!raw) return;
    const ids = raw.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 3);
    if (!ids.length) return;
    let cancelled = false;
    (async () => {
      const results = await Promise.all(
        ids.map((id) =>
          supabase.from("reports").select("output, inputs").eq("id", id).maybeSingle()
            .then(({ data, error }) => {
              if (error || !data) return null;
              const inputs = data.inputs as unknown as ConceptInputs;
              const output = ensureEvidenceFields(data.output as unknown as FeasibilityReport, inputs);
              return { id, value: { report: output, inputs } };
            }),
        ),
      );
      if (cancelled) return;
      const next: Record<string, LoadedReport> = {};
      const okIds: string[] = [];
      for (const r of results) {
        if (r) { next[r.id] = r.value; okIds.push(r.id); }
      }
      if (okIds.length) {
        commitLoaded({ ...loadedRef.current, ...next });
        commitPicked(okIds);
      }
    })();
    return () => { cancelled = true; };
  }, [searchParams]);

  const toggle = async (id: string) => {
    if (pickedRef.current.includes(id)) {
      commitPicked(pickedRef.current.filter((value) => value !== id));
      return;
    }
    if (pickedRef.current.length >= 3) { toast.info("Up to 3 reports at once"); return; }
    if (pendingLoads.current.has(id)) return;
    pendingLoads.current.add(id);
    try {
      if (!loadedRef.current[id]) {
        const { data, error } = await supabase.from("reports").select("output, inputs").eq("id", id).single();
        if (error) { toast.error(error.message); return; }
        const reportInputs = data.inputs as unknown as ConceptInputs;
        commitLoaded({
          ...loadedRef.current,
          [id]: {
            inputs: reportInputs,
            report: ensureEvidenceFields(data.output as unknown as FeasibilityReport, reportInputs),
          },
        });
      }
      if (!pickedRef.current.includes(id) && pickedRef.current.length < 3) {
        commitPicked([...pickedRef.current, id]);
      }
    } finally {
      pendingLoads.current.delete(id);
    }
  };

  const cells = picked.map((id) => ({
    id,
    row: rows.find((r) => r.id === id),
    report: loaded[id]?.report,
    inputs: loaded[id]?.inputs,
  }));
  const comparisonSummaries = cells.length > 1 && cells[0].report
    ? cells.slice(1).flatMap((cell) => cell.report
      ? [{
          id: cell.id,
          title: cell.row?.title || "Selected report",
          diff: compareCanonicalReports(cells[0].report!, cell.report, cells[0].inputs, cell.inputs),
        }]
      : [])
    : [];

  return (
    <div>
      <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1 text-[12px] text-muted-foreground">
        <Link to="/dashboard" className="transition-colors hover:text-foreground">
          My Analyses
        </Link>
        <ChevronRight className="h-3.5 w-3.5 opacity-50" />
        <span className="text-foreground/80">Compare</span>
      </nav>
      <div className="mb-6 flex items-center gap-3">
        <GitCompare className="h-5 w-5 text-primary" />
        <h1 className="font-display text-2xl font-medium tracking-tight">Compare analyses</h1>
      </div>
      <p className="mb-3 text-sm text-muted-foreground">Pick up to 3 saved reports to compare side-by-side.</p>


        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : loadError ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">Could not load reports for comparison.</p>
            <Button className="mt-3" onClick={() => setRetryKey((value) => value + 1)}>Retry</Button>
          </div>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[12px] text-muted-foreground" aria-live="polite">
                {picked.length} of 3 selected
              </p>
              {picked.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => commitPicked([])}
                  aria-label="Clear all selected reports"
                  className="h-7 px-2 text-[12px]"
                >
                  Clear selection
                </Button>
              )}
            </div>
            <div className="mb-8 flex flex-wrap gap-2">
              {rows.map((r) => {
                const isPicked = picked.includes(r.id);
                const atLimit = picked.length >= 3 && !isPicked;
                return (
                  <Button
                    key={r.id}
                    variant={isPicked ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggle(r.id)}
                    disabled={atLimit}
                    aria-pressed={isPicked}
                    aria-label={`${isPicked ? "Remove from" : "Add to"} comparison: ${r.title}`}
                    className={atLimit ? "opacity-50" : undefined}
                  >
                    {r.title}
                  </Button>
                );
              })}

            </div>

            {cells.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-border/60">
                <table className="w-full text-sm">
                  <thead className="bg-card/50 text-[11px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 text-left">Dimension</th>
                      {cells.map((c) => <th key={c.id} className="px-4 py-3 text-left">{c.row?.title}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {dims.map((d) => (
                      <tr key={d.key}>
                        <td className="px-4 py-3 font-medium">{d.label}</td>
                        {cells.map((c) => {
                          const v = c.report?.scores[d.key as keyof typeof c.report.scores] as number | undefined;
                          return <td key={c.id} className="px-4 py-3"><span className="font-mono text-primary">{v != null ? v.toFixed(1) : "—"}</span> / 10</td>;
                        })}
                      </tr>
                    ))}
                    <tr>
                      <td className="px-4 py-3 font-medium">Verdict</td>
                      {cells.map((c) => <td key={c.id} className="px-4 py-3">{c.report?.scores.verdict || "—"}</td>)}
                    </tr>
                    <tr>
                      <td className="px-4 py-3 font-medium">Investment</td>
                      {cells.map((c) => <td key={c.id} className="px-4 py-3"><span title={c.report?.financials.investmentRange || ""}>{compactCurrencyString(c.report?.financials.investmentRange) || "—"}</span></td>)}
                    </tr>
                    <tr>
                      <td className="px-4 py-3 font-medium">Break-even</td>
                      {cells.map((c) => <td key={c.id} className="px-4 py-3">{c.report?.financials.breakEvenSummary || "—"}</td>)}
                    </tr>
                    <tr>
                      <td className="px-4 py-3 font-medium">TAM</td>
                      {cells.map((c) => <td key={c.id} className="px-4 py-3" title={c.report?.market.tamValue || ""}>{compactCurrencyString(c.report?.market.tamValue) || "—"}</td>)}
                    </tr>
                    <tr>
                      <td className="px-4 py-3 font-medium align-top">Top risks</td>
                      {cells.map((c) => (
                        <td key={c.id} className="px-4 py-3 align-top text-[12px] text-muted-foreground">
                          {c.report?.risks.slice(0, 3).map((risk) => risk.name).join(" · ") || "—"}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
            {comparisonSummaries.length > 0 && (
              <div className="mt-6 space-y-3">
                <h2 className="font-display text-lg font-medium">Meaningful version differences</h2>
                {comparisonSummaries.map(({ id, title, diff }) => (
                  <div key={id} className="rounded-xl border border-border bg-card/50 p-4 text-sm">
                    <div className="font-medium">Baseline → {title}</div>
                    {diff.scoringVersionMismatch && (
                      <div className="mt-2 rounded border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
                        Scoring-engine versions differ ({diff.previousScoringVersion} → {diff.nextScoringVersion}); compare score changes with caution.
                      </div>
                    )}
                    <div className="mt-3 grid gap-2 text-xs md:grid-cols-2">
                      <div><span className="font-semibold">Changed inputs:</span> {diff.changedInputs.join(", ") || "None"}</div>
                      <div><span className="font-semibold">Score / verdict:</span> {diff.scoreDelta >= 0 ? "+" : ""}{diff.scoreDelta.toFixed(1)}{diff.verdictChanged ? " · verdict changed" : ""}</div>
                      <div><span className="font-semibold">Sources:</span> +{diff.addedSources.length} / −{diff.removedSources.length}</div>
                      <div><span className="font-semibold">Financial assumptions:</span> {diff.financialChanges.join(", ") || "No material change"}</div>
                      <div><span className="font-semibold">Risks added / removed:</span> +{diff.addedRisks.length} / −{diff.removedRisks.length}</div>
                      <div><span className="font-semibold">Risk levels changed:</span> {diff.changedRiskLevels.join(", ") || "None"}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
    </div>
  );
};

export default Compare;
