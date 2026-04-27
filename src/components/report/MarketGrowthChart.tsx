import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

export const MarketGrowthChart = ({
  data, currency,
}: { data: Array<{ year: string; tam: number; sam: number }>; currency: string }) => (
  <div className="h-64 w-full">
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="year" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
        <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
          label={{ value: `Billion ${currency}`, angle: -90, position: "insideLeft", style: { fill: "hsl(var(--muted-foreground))", fontSize: 11 } }} />
        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="tam" name="TAM" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 4 }} />
        <Line type="monotone" dataKey="sam" name="SAM" stroke="hsl(var(--success))" strokeWidth={2.5} dot={{ r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  </div>
);
