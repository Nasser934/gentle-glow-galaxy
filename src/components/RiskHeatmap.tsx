import { useState } from "react";
import { RiskItem } from "@/types/analysis";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface RiskHeatmapProps {
  risks: RiskItem[];
}

const likelihoodLabels = ["Rare", "Unlikely", "Possible", "Likely", "Almost Certain"];
const impactLabels = ["Negligible", "Minor", "Moderate", "Major", "Severe"];

const getCellColor = (likelihood: number, impact: number) => {
  const score = likelihood * impact;
  if (score >= 15) return "bg-destructive/80 hover:bg-destructive";
  if (score >= 8) return "bg-warning/70 hover:bg-warning";
  if (score >= 4) return "bg-warning/30 hover:bg-warning/50";
  return "bg-success/30 hover:bg-success/50";
};

const RiskHeatmap = ({ risks }: RiskHeatmapProps) => {
  const getRisksAt = (likelihood: number, impact: number) =>
    risks.filter((r) => r.likelihood === likelihood && r.impact === impact);

  return (
    <div className="rounded-xl border border-border bg-card p-6 card-shadow">
      <h3 className="mb-6 font-display text-lg font-semibold text-foreground">Risk Heatmap</h3>
      <div className="overflow-x-auto">
        <div className="min-w-[420px]">
          <div className="mb-1 flex items-end">
            <div className="w-24" />
            {impactLabels.map((label) => (
              <div key={label} className="flex-1 px-0.5 text-center text-[10px] font-medium text-muted-foreground">
                {label}
              </div>
            ))}
          </div>
          <div className="flex items-center mb-1">
            <div className="w-24" />
            <div className="flex-1 text-center text-xs font-semibold text-muted-foreground" style={{ gridColumn: "span 5" }}>
              Impact →
            </div>
          </div>
          {[5, 4, 3, 2, 1].map((likelihood) => (
            <div key={likelihood} className="flex items-stretch gap-0.5 mb-0.5">
              <div className="flex w-24 items-center justify-end pr-2 text-[10px] font-medium text-muted-foreground">
                {likelihoodLabels[likelihood - 1]}
              </div>
              {[1, 2, 3, 4, 5].map((impact) => {
                const cellRisks = getRisksAt(likelihood, impact);
                return (
                  <Popover key={`${likelihood}-${impact}`}>
                    <PopoverTrigger asChild>
                      <button
                        className={`flex min-h-[48px] flex-1 items-center justify-center rounded-md transition-colors ${getCellColor(likelihood, impact)} ${
                          cellRisks.length > 0 ? "ring-2 ring-foreground/20" : ""
                        }`}
                      >
                        {cellRisks.length > 0 && (
                          <span className="text-xs font-bold text-foreground">{cellRisks.length}</span>
                        )}
                      </button>
                    </PopoverTrigger>
                    {cellRisks.length > 0 && (
                      <PopoverContent className="w-72">
                        {cellRisks.map((r, i) => (
                          <div key={i} className={i > 0 ? "mt-3 border-t border-border pt-3" : ""}>
                            <p className="font-semibold text-foreground text-sm">{r.name}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{r.description}</p>
                            <p className="mt-2 text-xs"><span className="font-medium text-primary">Mitigation:</span> {r.mitigation}</p>
                          </div>
                        ))}
                      </PopoverContent>
                    )}
                  </Popover>
                );
              })}
            </div>
          ))}
          <div className="mt-1 flex items-center">
            <div className="w-24 text-right pr-2 text-xs font-semibold text-muted-foreground">
              Likelihood ↑
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RiskHeatmap;
