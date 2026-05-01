import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { CapExItem } from "@/types/analysis";

const COLORS = ["#1f4ed8", "#2563eb", "#3b82f6", "#60a5fa", "#0891b2", "#0ea5e9", "#0d9488", "#14b8a6"];

export const CapExBarChart = ({ data, currency }: { data: CapExItem[]; currency: string }) => {
  const chartData = data.map((d) => ({ name: d.category, value: Math.round((d.low + d.high) / 2) }));
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 24, left: 110, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
          <XAxis type="number" tick={{ fill: "#64748b", fontSize: 11 }}
            label={{ value: currency, position: "insideBottom", offset: -2, style: { fill: "#64748b", fontSize: 11 } }} />
          <YAxis type="category" dataKey="name" tick={{ fill: "#0f172a", fontSize: 11 }} width={110} />
          <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: 8 }} />
          <Bar dataKey="value" radius={[0, 6, 6, 0]}>
            {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
