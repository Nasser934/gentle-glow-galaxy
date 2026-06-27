import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

// Fixed report palette — must match printable PDF (theme-independent)
const REPORT = {
  primary: "#1f4ed8",
  success: "#16a34a",
  border: "#cbd5e1",
  muted: "#64748b",
  card: "#ffffff",
};

/** Compact number formatter — 45_900_000_000 → "45.9B", 3_750_000 → "3.75M". */
const compact = (n: number): string => {
  if (!Number.isFinite(n)) return "";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${(n / 1e12).toFixed(1)}T`;
  if (abs >= 1e9)  return `${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6)  return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3)  return `${(n / 1e3).toFixed(1)}K`;
  return `${n}`;
};

export const MarketGrowthChart = ({
  data, currency,
}: { data: Array<{ year: string; tam: number; sam: number }>; currency: string }) => {
  // Choose unit hint from the largest value present.
  const peak = Math.max(0, ...data.flatMap((d) => [d.tam || 0, d.sam || 0]));
  const unitHint =
    peak >= 1e9 ? `${currency} billions`
    : peak >= 1e6 ? `${currency} millions`
    : peak >= 1e3 ? `${currency} thousands`
    : currency;

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 24, left: 24, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={REPORT.border} />
          <XAxis dataKey="year" tick={{ fill: REPORT.muted, fontSize: 11 }} />
          <YAxis
            tick={{ fill: REPORT.muted, fontSize: 11 }}
            tickFormatter={compact}
            width={64}
            label={{ value: unitHint, angle: -90, position: "insideLeft", offset: -4, style: { fill: REPORT.muted, fontSize: 11 } }}
          />
          <Tooltip
            contentStyle={{ background: REPORT.card, border: `1px solid ${REPORT.border}`, borderRadius: 8 }}
            formatter={(v: number) => `${compact(v)} ${currency}`}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="tam" name="TAM" stroke={REPORT.primary} strokeWidth={2.5} dot={{ r: 4 }} />
          <Line type="monotone" dataKey="sam" name="SAM" stroke={REPORT.success} strokeWidth={2.5} dot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
