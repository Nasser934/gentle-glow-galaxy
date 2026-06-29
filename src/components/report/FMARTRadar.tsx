import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from "recharts";
import type { FMARTScores } from "@/types/analysis";

// Fixed report palette — must match printable PDF (theme-independent).
// Values chosen to remain readable on BOTH the dark dashboard background
// AND the white PDF capture background.
const REPORT_COLORS = {
  primary: "#1f4ed8",
  stroke: "#1e3a8a",
  grid: "#475569",      // slate-600 — visible on white and dark
  label: "#0f172a",     // slate-900 — readable on white PDF
  radius: "#334155",    // slate-700
};

export const FMARTRadar = ({ scores }: { scores: FMARTScores }) => {
  const data = [
    { dim: "Financial",     value: scores.financial,     full: 10 },
    { dim: "Market",        value: scores.market,        full: 10 },
    { dim: "Achievability", value: scores.achievability, full: 10 },
    { dim: "Risk (inv.)",   value: scores.risk,          full: 10 },
    { dim: "Timing",        value: scores.timing,        full: 10 },
    { dim: "Operational",   value: scores.operational,   full: 10 },
  ];
  return (
    <div className="h-72 w-full" data-pdf-chart-style="light">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="78%">
          <PolarGrid stroke={REPORT_COLORS.grid} strokeOpacity={0.7} />
          <PolarAngleAxis dataKey="dim" tick={{ fill: REPORT_COLORS.label, fontSize: 11, fontWeight: 700 }} />
          <PolarRadiusAxis angle={90} domain={[0, 10]} tick={{ fill: REPORT_COLORS.radius, fontSize: 9 }} />
          <Radar
            name="Score"
            dataKey="value"
            stroke={REPORT_COLORS.stroke}
            strokeWidth={2}
            fill={REPORT_COLORS.primary}
            fillOpacity={0.3}
            dot={{ r: 3, fill: REPORT_COLORS.stroke, stroke: REPORT_COLORS.stroke }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
};
