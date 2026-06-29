import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { CapExItem } from "@/types/analysis";
import { useIsMobile } from "@/hooks/use-mobile";

const COLORS = ["#1f4ed8", "#2563eb", "#3b82f6", "#60a5fa", "#0891b2", "#0ea5e9", "#0d9488", "#14b8a6"];

const compact = (n: number) => {
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(1)}Bn`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)}Mn`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return `${n}`;
};

export const CapExBarChart = ({ data, currency }: { data: CapExItem[]; currency: string }) => {
  const isMobile = useIsMobile();
  const chartData = data.map((d) => ({ name: d.category, value: Math.round((d.low + d.high) / 2) }));

  // Give each row enough vertical room so labels never overlap; scales with item count.
  const rowH = isMobile ? 56 : 44;
  const height = Math.max(288, chartData.length * rowH + 56);
  const leftPad = isMobile ? 132 : 150;

  return (
    <div className="w-full overflow-x-auto" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
          <XAxis
            type="number"
            tick={{ fill: "#64748b", fontSize: 10 }}
            tickFormatter={compact}
            label={{ value: currency, position: "insideBottom", offset: -4, style: { fill: "#64748b", fontSize: 10 } }}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fill: "#0f172a", fontSize: isMobile ? 10 : 11 }}
            width={leftPad}
            interval={0}
          />
          <Tooltip
            contentStyle={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: 8 }}
            formatter={(v: number) => [`${compact(v)} ${currency}`, "Value"]}
          />
          <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={isMobile ? 14 : 18}>
            {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
