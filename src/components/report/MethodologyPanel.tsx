import { useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import type { FMARTScores } from "@/types/analysis";
import { confidencePercent, formatConfidence } from "@/lib/format";

const labels: Record<string, string> = {
  financial: "Financial",
  market: "Market",
  achievability: "Achievability",
  risk: "Risk (inv.)",
  timing: "Timing",
  operational: "Operational",
};

const defaultWeights = {
  financial: 0.25, market: 0.20, achievability: 0.15,
  risk: 0.20, timing: 0.10, operational: 0.10,
};

const verdictRule = [
  { range: "≥ 7.5", verdict: "PROCEED", tone: "text-emerald-600" },
  { range: "6.0 – 7.4", verdict: "PROCEED WITH CAUTION", tone: "text-amber-600" },
  { range: "4.5 – 5.9", verdict: "REVISE", tone: "text-orange-600" },
  { range: "< 4.5", verdict: "DO NOT PROCEED", tone: "text-rose-600" },
];

export const MethodologyPanel = ({ scores }: { scores: FMARTScores }) => {
  const [open, setOpen] = useState(false);
  const w = scores.weights || defaultWeights;
  const c = scores.confidence;
  const r = scores.rationale;
  const dims = ["financial", "market", "achievability", "risk", "timing", "operational"] as const;

  const avgConf = c ? Math.round(dims.reduce((a, d) => a + (c[d] || 0), 0) / dims.length) : null;

  return (
    <div className="rounded-xl border border-border/60 bg-card/40 backdrop-blur">
      <button onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-5 py-4 text-left">
        <div className="flex items-center gap-2.5">
          <Info className="h-4 w-4 text-primary" />
          <div>
            <div className="font-display text-[14px] font-medium tracking-tight">FMART methodology & confidence</div>
            <div className="text-[12px] text-muted-foreground">
              Weighted overall: <span className="font-mono text-foreground">{scores.overall.toFixed(1)}</span>
              {avgConf != null && <> · Average analyst confidence: <span className="font-mono text-foreground">{avgConf}%</span></>}
            </div>
          </div>
        </div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t border-border/60 p-5">
          <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <h4 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Verdict thresholds</h4>
              <table className="w-full text-[13px]">
                <tbody className="divide-y divide-border/60">
                  {verdictRule.map((v) => (
                    <tr key={v.verdict}>
                      <td className="py-1.5 font-mono text-muted-foreground">{v.range}</td>
                      <td className={`py-1.5 font-medium ${v.tone}`}>{v.verdict}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <h4 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Dimension weights (sum = 1.00)</h4>
              <div className="space-y-1.5">
                {dims.map((d) => {
                  const wv = (w[d] || 0);
                  return (
                    <div key={d} className="flex items-center gap-2">
                      <div className="w-28 text-[12px] text-muted-foreground">{labels[d]}</div>
                      <div className="flex-1 overflow-hidden rounded-full bg-border/50">
                        <div className="h-1.5 bg-primary" style={{ width: `${Math.min(100, wv * 200)}%` }} />
                      </div>
                      <div className="w-12 text-right font-mono text-[12px]">{(wv * 100).toFixed(0)}%</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <h4 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Per-dimension breakdown</h4>
          <div className="overflow-hidden rounded-lg border border-border/60">
            <table className="w-full text-[13px]">
              <thead className="bg-card/60 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Dimension</th>
                  <th className="px-3 py-2 text-right">Score</th>
                  <th className="px-3 py-2 text-right">Weight</th>
                  <th className="px-3 py-2 text-right">Confidence</th>
                  <th className="px-3 py-2 text-left">Rationale</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {dims.map((d) => {
                  const score = scores[d] as number;
                  const conf = c?.[d];
                  const rat = r?.[d];
                  return (
                    <tr key={d}>
                      <td className="px-3 py-2 font-medium">{labels[d]}</td>
                      <td className="px-3 py-2 text-right font-mono text-primary">{score.toFixed(1)}</td>
                      <td className="px-3 py-2 text-right font-mono text-muted-foreground">{((w[d] || 0) * 100).toFixed(0)}%</td>
                      <td className="px-3 py-2 text-right">
                        {conf != null ? (
                          <span className={`font-mono ${conf >= 70 ? "text-emerald-600" : conf >= 40 ? "text-amber-600" : "text-rose-600"}`}>{conf}%</span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2 text-[12px] text-muted-foreground">{rat || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
            <strong className="text-foreground">How to read this:</strong> each dimension is scored 0–10 by the AI engine using your inputs and the public + Tavily-grounded research context.
            The overall score is a weighted average. Confidence reflects how much of the score is anchored in evidence vs. inferred.
            A low-confidence dimension is a signal to gather more data before committing.
          </p>
        </div>
      )}
    </div>
  );
};
