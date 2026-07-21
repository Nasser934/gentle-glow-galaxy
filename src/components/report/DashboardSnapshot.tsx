import { BarChart, Bar, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { FMARTRadar } from "./FMARTRadar";
import type { ConceptInputs, FeasibilityReport } from "@/types/analysis";
import { compactCurrencyString } from "@/lib/format";
import { formatBreakEvenDisplay } from "@/lib/breakEven";


/**
 * Print-only snapshot of the analysis dashboard. Uses a fixed hex palette
 * (theme-independent) so the PDF page 1 always matches the printable
 * report's colors regardless of light/dark mode.
 */

const PALETTE = {
  primary: "#1f4ed8",
  primaryLight: "#3b82f6",
  success: "#16a34a",
  warning: "#f59e0b",
  destructive: "#dc2626",
  muted: "#64748b",
  border: "#cbd5e1",
  surface: "#f8fafc",
  text: "#0f172a",
  card: "#ffffff",
};

const BAR_COLORS = [
  PALETTE.primary,
  PALETTE.success,
  PALETTE.warning,
  PALETTE.destructive,
  PALETTE.primaryLight,
  PALETTE.muted,
];

const verdictBg = (v: string) =>
  v === "PROCEED" ? PALETTE.success
  : v === "PROCEED WITH CAUTION" || v === "REVISE" ? PALETTE.warning
  : PALETTE.destructive;

const Kpi = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <div className="rounded-xl border p-4" style={{ borderColor: PALETTE.border, background: PALETTE.surface }}>
    <div className="text-[9px] font-bold uppercase tracking-wider" style={{ color: PALETTE.muted }}>{label}</div>
    <div className="mt-1 font-display text-lg font-bold" style={{ color: PALETTE.text }}>{value}</div>
    {sub && <div className="mt-0.5 text-[10px]" style={{ color: PALETTE.muted }}>{sub}</div>}
  </div>
);

export const DashboardSnapshot = ({
  report, inputs, pageNum, total,
}: { report: FeasibilityReport; inputs: ConceptInputs; pageNum: number; total: number }) => {
  const cur = report.financials.currency;
  const research = report.research;
  const researchCount = research?.citations?.length ?? 0;

  const scoreData = [
    { name: "Financial",   score: report.scores.financial },
    { name: "Market",      score: report.scores.market },
    { name: "Achievable",  score: report.scores.achievability },
    { name: "Operational", score: report.scores.operational },
    { name: "Risk",        score: report.scores.risk },
    { name: "Timing",      score: report.scores.timing },
  ];

  return (
    <div
      data-pdf-page
      className="report-page relative mx-auto shadow-xl"
      style={{
        width: "794px", minHeight: "1123px",
        padding: "48px 56px 72px", boxSizing: "border-box",
        fontFamily: "Inter, sans-serif",
        background: PALETTE.card, color: PALETTE.text,
      }}
    >
      {/* Header band */}
      <div className="mb-6 flex items-center justify-between border-b-2 pb-3" style={{ borderColor: PALETTE.primary }}>
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: PALETTE.primary }}>
          Concept AI · Analysis Dashboard
        </div>
        <div className="text-[10px] font-medium uppercase tracking-wider" style={{ color: PALETTE.muted }}>
          {inputs.projectName} · Page {pageNum}/{total}
        </div>
      </div>

      {/* Title row */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: PALETTE.muted }}>Project</div>
          <h1 className="mt-1 font-display text-[26px] font-extrabold leading-tight" style={{ color: PALETTE.text }}>
            {inputs.projectName} — Analysis Dashboard
          </h1>
          <p className="mt-1 text-[12px]" style={{ color: PALETTE.muted }}>
            Interactive feasibility command center with market research, charts, risk signals, and financial figures.
          </p>
        </div>
        <div
          className="rounded-md px-3 py-1.5 font-display text-[12px] font-bold uppercase tracking-wide text-white"
          style={{ background: verdictBg(report.scores.verdict) }}
        >
          {report.scores.verdict}
        </div>
      </div>

      {/* KPI grid */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        <Kpi label="Overall Score"     value={`${report.scores.overall.toFixed(1)} / 10`} sub="Server-validated FMART-O weighted" />
        <Kpi label="Investment"        value={compactCurrencyString(report.financials.investmentRange)} sub={cur} />
        <Kpi label="Break-Even"        value={formatBreakEvenDisplay(report.financials.breakEvenSummary)} />
        <Kpi label="Market TAM"        value={compactCurrencyString(report.market.tamValue)} sub={`CAGR ${report.market.tamCagr}`} />

        <Kpi label="Research Signals"  value={`${researchCount || "—"}`} sub={research?.coverage || (research?.confidence ? `${research.confidence} analysis indicator` : "Available external evidence")} />
        <Kpi label="Verdict"           value={report.scores.verdict} sub={`Report ${report.reportId}`} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border p-3" style={{ borderColor: PALETTE.border, background: PALETTE.card }}>
          <div className="mb-1 font-display text-[12px] font-semibold uppercase tracking-wide" style={{ color: PALETTE.text }}>
            FMART-O Radar
          </div>
          <FMARTRadar scores={report.scores} />
        </div>

        {scoreData.some((d) => d.score > 0) && (
          <div className="rounded-xl border p-3" style={{ borderColor: PALETTE.border, background: PALETTE.card }}>
            <div className="mb-1 font-display text-[12px] font-semibold uppercase tracking-wide" style={{ color: PALETTE.text }}>
              Score Distribution
            </div>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={scoreData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.border} />
                  <XAxis dataKey="name" tick={{ fill: PALETTE.muted, fontSize: 10 }} />
                  <YAxis domain={[0, 10]} tick={{ fill: PALETTE.muted, fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: PALETTE.card, border: `1px solid ${PALETTE.border}`, borderRadius: 8 }} />
                  <Bar dataKey="score" radius={[6, 6, 0, 0]}>
                    {scoreData.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Strategic recommendations */}
      <div className="mt-5 rounded-xl border p-4" style={{ borderColor: PALETTE.border, background: PALETTE.surface }}>
        <div className="mb-2 font-display text-[12px] font-semibold uppercase tracking-wide" style={{ color: PALETTE.text }}>
          Strategic Recommendations
        </div>
        <ol className="space-y-1.5 text-[11px] leading-relaxed" style={{ color: PALETTE.text }}>
          {report.recommendations.slice(0, 5).map((rec, i) => (
            <li key={i} className="flex gap-2">
              <span
                className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
                style={{ background: PALETTE.primary }}
              >
                {i + 1}
              </span>
              <span>{rec}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Footer */}
      <div
        className="absolute bottom-6 left-14 right-14 flex items-center justify-between border-t pt-3 text-[9px] uppercase tracking-wider"
        style={{ borderColor: "#e2e8f0", color: "#94a3b8" }}
      >
        <span>Confidential · AI-Generated · Not financial advice</span>
        <span>{new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</span>
      </div>
    </div>
  );
};
