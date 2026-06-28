import { useEffect, useState } from "react";
import { Loader2, GitCompare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listMyReports } from "@/lib/reports";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { FeasibilityReport } from "@/types/analysis";

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
  const [rows, setRows] = useState<any[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [loaded, setLoaded] = useState<Record<string, FeasibilityReport>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => { listMyReports().then(setRows).catch((e) => toast.error(e.message)).finally(() => setLoading(false)); }, []);

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
    <div className="min-h-screen bg-background">
      <nav className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto flex h-14 items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15 ring-1 ring-inset ring-primary/30">
              <BarChart3 className="h-3.5 w-3.5 text-primary" />
            </div>
            <span className="text-[15px] font-medium tracking-tight">Concept AI</span>
          </Link>
          <div className="flex items-center gap-2"><ThemeToggle /><UserMenu /></div>
        </div>
      </nav>

      <div className="container mx-auto px-6 py-10">
        <div className="mb-6 flex items-center gap-3">
          <GitCompare className="h-5 w-5 text-primary" />
          <h1 className="font-display text-2xl font-medium tracking-tight">Compare analyses</h1>
        </div>
        <p className="mb-6 text-sm text-muted-foreground">Pick up to 3 saved reports to compare side-by-side.</p>

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : (
          <>
            <div className="mb-8 flex flex-wrap gap-2">
              {rows.map((r) => (
                <Button key={r.id} variant={picked.includes(r.id) ? "default" : "outline"} size="sm" onClick={() => toggle(r.id)}>
                  {r.title}
                </Button>
              ))}
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
                      {cells.map((c) => <td key={c.id} className="px-4 py-3">{c.report?.market.tamValue || "—"}</td>)}
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
    </div>
  );
};

export default Compare;
