import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

// Fixed report palette — must match printable PDF (theme-independent)
const REPORT = {
  primary: "#1f4ed8",
  success: "#16a34a",
  border: "#cbd5e1",
  muted: "#64748b",
  card: "#ffffff",
};

export const MarketGrowthChart = ({
  data, currency,
}: { data: Array<{ year: string; tam: number; sam: number }>; currency: string }) => (
  <div className="h-64 w-full">
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={REPORT.border} />
        <XAxis dataKey="year" tick={{ fill: REPORT.muted, fontSize: 11 }} />
        <YAxis tick={{ fill: REPORT.muted, fontSize: 11 }}
          label={{ value: `Billion ${currency}`, angle: -90, position: "insideLeft", style: { fill: REPORT.muted, fontSize: 11 } }} />
        <Tooltip contentStyle={{ background: REPORT.card, border: `1px solid ${REPORT.border}`, borderRadius: 8 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="tam" name="TAM" stroke={REPORT.primary} strokeWidth={2.5} dot={{ r: 4 }} />
        <Line type="monotone" dataKey="sam" name="SAM" stroke={REPORT.success} strokeWidth={2.5} dot={{ r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  </div>
);
