import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Loader2, GitCompare, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listMyReports } from "@/lib/reports";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { FeasibilityReport } from "@/types/analysis";
import { compactCurrencyString } from "@/lib/format";


const dims = [
  { key: "financial", label: "Financial" },
  { key: "market", label: "Market" },
  { key: "achievability", label: "Achievability" },
  { key: "operational", label: "Operational" },
  { key: "risk", label: "Risk (inv.)" },
  { key: "timing", label: "Timing" },
  { key: "overall", label: "Overall" },
] as const;

const Compare = () => {
  const [searchParams] = useSearchParams();
  const [rows, setRows] = useState<any[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [loaded, setLoaded] = useState<Record<string, FeasibilityReport>>({});
  const [loading, setLoading] = useState(true);

  // Load all reports (active + archived) so deep links from the dashboard
  // can preselect even older versions.
  useEffect(() => {
    listMyReports("all")
      .then(setRows)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

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
          supabase.from("reports").select("output").eq("id", id).maybeSingle()
            .then(({ data, error }) => (error || !data ? null : { id, output: data.output as unknown as FeasibilityReport })),
        ),
      );
      if (cancelled) return;
      const next: Record<string, FeasibilityReport> = {};
      const okIds: string[] = [];
      for (const r of results) {
        if (r) { next[r.id] = r.output; okIds.push(r.id); }
      }
      if (okIds.length) {
        setLoaded((prev) => ({ ...prev, ...next }));
        setPicked(okIds);
      }
    })();
    return () => { cancelled = true; };
  }, [searchParams]);

  const toggle = async (id: string) => {
    if (picked.includes(id)) { setPicked(picked.filter((x) => x !== id)); return; }
    if (picked.length >= 3) { toast.info("Up to 3 reports at once"); return; }
    if (!loaded[id]) {
      const { data, error } = await supabase.from("reports").select("output").eq("id", id).single();
      if (error) return toast.error(error.message);
      setLoaded({ ...loaded, [id]: data!.output as unknown as FeasibilityReport });
    }
    setPicked([...picked, id]);
  };

  const cells = picked.map((id) => ({ id, row: rows.find((r) => r.id === id), report: loaded[id] }));

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
                  onClick={() => setPicked([])}
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
                      {cells.map((c) => <td key={c.id} className="px-4 py-3">{c.report?.financials.investmentRange || "—"}</td>)}
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
                          {c.report?.risks.slice(0, 3).map((r: any) => r.name).join(" · ") || "—"}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
    </div>
  );
};

export default Compare;
