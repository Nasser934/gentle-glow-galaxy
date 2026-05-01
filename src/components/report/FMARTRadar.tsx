import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from "recharts";
import type { FMARTScores } from "@/types/analysis";

// Fixed report palette — must match printable PDF (theme-independent)
const REPORT_COLORS = {
  primary: "#1f4ed8",
  border: "#cbd5e1",
  text: "#0f172a",
  muted: "#64748b",
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
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="78%">
          <PolarGrid stroke={REPORT_COLORS.border} />
          <PolarAngleAxis dataKey="dim" tick={{ fill: REPORT_COLORS.text, fontSize: 11, fontWeight: 600 }} />
          <PolarRadiusAxis angle={90} domain={[0, 10]} tick={{ fill: REPORT_COLORS.muted, fontSize: 9 }} />
          <Radar name="Score" dataKey="value" stroke={REPORT_COLORS.primary} fill={REPORT_COLORS.primary} fillOpacity={0.35} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
};
