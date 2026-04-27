import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from "recharts";
import type { FMARTScores } from "@/types/analysis";

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
          <PolarGrid stroke="hsl(var(--border))" />
          <PolarAngleAxis dataKey="dim" tick={{ fill: "hsl(var(--foreground))", fontSize: 11, fontWeight: 600 }} />
          <PolarRadiusAxis angle={90} domain={[0, 10]} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} />
          <Radar name="Score" dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.35} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
};
