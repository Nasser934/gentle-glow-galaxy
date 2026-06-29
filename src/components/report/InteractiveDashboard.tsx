import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Activity,
  AlertTriangle,
  Clock,
  DollarSign,
  Globe2,
  PieChart as PieChartIcon,
  Route,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { FMARTRadar } from "./FMARTRadar";
import { MethodologyPanel } from "./MethodologyPanel";
import { MarketGrowthChart } from "./MarketGrowthChart";
import { CapExBarChart } from "./CapExBarChart";
import { SensitivityPanel } from "./SensitivityPanel";
import { EvidenceChips } from "./EvidenceChips";
import type { ConceptInputs, FeasibilityReport } from "@/types/analysis";

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(var(--destructive))",
  "hsl(var(--accent-foreground))",
  "hsl(var(--muted-foreground))",
];

const verdictTone = (v: string) =>
  v === "PROCEED" ? "bg-success text-success-foreground"
  : v === "PROCEED WITH CAUTION" ? "bg-warning text-warning-foreground"
  : v === "REVISE" ? "bg-warning text-warning-foreground"
  : "bg-destructive text-destructive-foreground";

const riskTone = (level: string) =>
  level === "Low" ? "bg-success/10 text-success border-success/20"
  : level === "Med" ? "bg-warning/10 text-warning border-warning/20"
  : "bg-destructive/10 text-destructive border-destructive/20";

const KpiCard = ({
  label,
  value,
  insight,
  caption,
  fullValue,
  icon: Icon,
}: {
  label: string;
  value: string;
  insight?: string;
  caption?: string;
  fullValue?: string | null;
  icon?: any;
}) => (
  <div className="flex h-full min-h-[148px] flex-col rounded-xl border border-border bg-card p-5">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
      </div>
      {Icon && (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
      )}
    </div>

    <div className="mt-4">
      <div
        className="font-display text-2xl font-semibold leading-tight text-foreground whitespace-normal break-words"
        title={String(fullValue ?? value ?? "")}
      >
        {value || "—"}
      </div>
      {caption && (
        <div className="mt-1 text-xs leading-snug text-muted-foreground">{caption}</div>
      )}
    </div>

    {insight && (
      <div
        className="mt-4 rounded-md border border-border/60 bg-muted/25 px-3 py-2 text-[12px] leading-relaxed text-muted-foreground"
        title={insight}
      >
        {insight}
      </div>
    )}
  </div>
);

const extractShortBreakEven = (text?: string | null) => {
  if (!text) return "—";
  const monthMatch = text.match(/(\d+)\s*[-–]?\s*month/i);
  if (monthMatch) return `${monthMatch[1]} months`;
  const yearMatch = text.match(/(\d+(?:\.\d+)?)\s*year/i);
  if (yearMatch) return `${yearMatch[1]} years`;
  return "See insight";
};

const normalizeCurrencyDisplay = (value?: string | null) => {
  if (value == null) return "—";
  return String(value)
    .replace(/\.000\b/g, "")
    .replace(/\.00\b/g, "")
    .replace(/\s*-\s*/g, "–");
};

const toNumber = (value?: string) => {
  const match = value?.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
};

const levelScore = (level: string) => level === "High" ? 3 : level === "Med" ? 2 : 1;

const MiniInsight = ({ title, items, citations }: { title: string; items: string[]; citations?: FeasibilityReport["research"]["citations"] }) => (
  <Card>
    <CardHeader className="pb-2"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
    <CardContent>
      <ul className="space-y-2 text-sm text-foreground">
        {items.slice(0, 5).map((item, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            <div className="min-w-0 flex-1">
              <span>{item}</span>
              <EvidenceChips text={item} citations={citations} />
            </div>
          </li>
        ))}
      </ul>
    </CardContent>
  </Card>
);

export const InteractiveDashboard = ({ report, inputs }: { report: FeasibilityReport; inputs: ConceptInputs }) => {
  const cur = report.financials.currency;
  const scoreData = [
    { name: "Financial", score: report.scores.financial, finding: report.scores.financialFinding },
    { name: "Market", score: report.scores.market, finding: report.scores.marketFinding },
    { name: "Achievable", score: report.scores.achievability, finding: report.scores.achievabilityFinding },
    { name: "Operational", score: report.scores.operational, finding: report.scores.operationalFinding },
    { name: "Risk", score: report.scores.risk, finding: report.scores.riskFinding },
    { name: "Timing", score: report.scores.timing, finding: report.scores.timingFinding },
  ];
  const riskData = report.risks.map((risk) => ({
    name: risk.name,
    exposure: levelScore(risk.probability) * levelScore(risk.impact),
    probability: levelScore(risk.probability),
    impact: levelScore(risk.impact),
    level: risk.level,
  }));
  const fundingData = report.fundingMix.map((item) => ({ name: item.source, value: toNumber(item.share) || 1 }));
  const scenarioData = report.financials.scenarios.map((item) => ({
    scenario: item.scenario,
    probability: toNumber(item.probability),
    revenue: toNumber(item.annualRevenue),
    breakEven: toNumber(item.breakEven),
  }));
  const opExData = report.financials.opEx.map((item) => ({ name: item.category, monthly: item.monthly, annual: item.annual }));
  const marketShareData = [
    { name: "TAM", value: toNumber(report.market.tamValue) || 100 },
    { name: "SAM", value: toNumber(report.market.samValue) || 35 },
    { name: "SOM", value: toNumber(report.market.somValue) || 8 },
  ];
  const research = report.research;
  const researchCount = research?.citations?.length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-foreground">{inputs.projectName} — Live Dashboard</h2>
          <p className="text-sm text-muted-foreground">Interactive feasibility command center with market research, charts, risk signals, and financial figures.</p>
        </div>
        <Badge className={`px-3 py-1.5 text-sm font-bold ${verdictTone(report.scores.verdict)}`}>
          {report.scores.verdict}
        </Badge>
      </div>

      <div className="grid items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5 [&>*]:h-full">
        <KpiCard
          icon={Target}
          label="Overall Score"
          value={`${report.scores.overall.toFixed(1)} / 10`}
          caption="FMART-O weighted"
          insight={report.scores.verdict}
          fullValue={`${report.scores.overall.toFixed(1)} / 10`}
        />
        <KpiCard
          icon={DollarSign}
          label="Investment"
          value={normalizeCurrencyDisplay(report.financials.investmentRange)}
          caption={cur || "USD"}
          insight="Estimated initial investment range"
          fullValue={report.financials.investmentRange}
        />
        <KpiCard
          icon={Clock}
          label="Break-even"
          value={extractShortBreakEven(report.financials.breakEvenSummary)}
          caption="Base case"
          insight={report.financials.breakEvenSummary}
          fullValue={report.financials.breakEvenSummary}
        />
        <KpiCard
          icon={TrendingUp}
          label="Market TAM"
          value={normalizeCurrencyDisplay(report.market.tamValue)}
          caption={report.market.tamCagr ? `CAGR ${report.market.tamCagr}` : undefined}
          insight={report.market.tamLabel}
          fullValue={report.market.tamValue}
        />
        <KpiCard
          icon={Globe2}
          label="Research Signals"
          value={`${researchCount || "—"}`}
          caption={research?.confidence ? `${research.confidence} confidence` : "Free public sources"}
          insight="Grounded research sources used in this analysis"
          fullValue={String(researchCount)}
        />
      </div>

      <Tabs defaultValue="score" className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 md:grid-cols-3 xl:grid-cols-6">
          <TabsTrigger value="score" className="gap-2"><Activity className="h-4 w-4" /> Score</TabsTrigger>
          <TabsTrigger value="market" className="gap-2"><TrendingUp className="h-4 w-4" /> Market</TabsTrigger>
          <TabsTrigger value="financial" className="gap-2"><PieChartIcon className="h-4 w-4" /> Financial</TabsTrigger>
          <TabsTrigger value="risk" className="gap-2"><AlertTriangle className="h-4 w-4" /> Risk</TabsTrigger>
          <TabsTrigger value="research" className="gap-2"><Globe2 className="h-4 w-4" /> Research</TabsTrigger>
          <TabsTrigger value="roadmap" className="gap-2"><Route className="h-4 w-4" /> Roadmap</TabsTrigger>
        </TabsList>

        <TabsContent value="score" className="space-y-4">
          <MethodologyPanel scores={report.scores} />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1.2fr]">
            <Card>
              <CardHeader><CardTitle className="text-base">FMART-O Radar</CardTitle></CardHeader>
              <CardContent><FMARTRadar scores={report.scores} /></CardContent>
            </Card>
            {scoreData.some((d) => d.score > 0) ? (
              <Card>
                <CardHeader><CardTitle className="text-base">Score Distribution</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={scoreData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                        <YAxis domain={[0, 10]} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                        <Bar dataKey="score" radius={[6, 6, 0, 0]}>
                          {scoreData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </div>
          <Card>
            <CardHeader><CardTitle className="text-base">Dimension Findings</CardTitle></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {scoreData.map((item) => (
                <div key={item.name} className="rounded-md border border-border bg-card p-3">
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium text-foreground">{item.name}</span>
                    <span className="font-semibold text-primary">{item.score.toFixed(1)} / 10</span>
                  </div>
                  <Progress value={item.score * 10} className="h-2" />
                  <p className="mt-2 text-xs text-muted-foreground">{item.finding}</p>
                  <EvidenceChips text={item.finding} citations={research?.citations} />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="market" className="space-y-4">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Market Growth — TAM vs SAM</CardTitle></CardHeader>
              <CardContent><MarketGrowthChart data={report.market.growthChart} currency={report.market.currency} /></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">TAM / SAM / SOM Funnel</CardTitle></CardHeader>
              <CardContent>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={marketShareData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                      <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                      <Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.22} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {[
              ["TAM", report.market.tamValue, report.market.tamLabel, report.market.tamCagr],
              ["SAM", report.market.samValue, report.market.samLabel, report.market.samCagr],
              ["SOM", report.market.somValue, report.market.somLabel, report.market.somCagr],
            ].map(([label, value, desc, cagr]) => (
              <Card key={label}>
                <CardContent className="p-5">
                  <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
                  <div className="mt-1 font-display text-2xl font-bold text-primary">{value}</div>
                  <p className="mt-2 text-sm text-foreground">{desc}</p>
                  <Badge variant="outline" className="mt-3">CAGR {cagr}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardHeader><CardTitle className="text-base">Competitor Positioning</CardTitle></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {report.competitors.map((competitor) => (
                <div key={competitor.name} className="rounded-md border border-border p-3">
                  <div className="font-semibold text-foreground">{competitor.name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{competitor.model}</div>
                  <div className="mt-2 grid gap-2 text-xs md:grid-cols-2">
                    <p><span className="font-semibold text-destructive">Weakness:</span> {competitor.weakness}</p>
                    <p><span className="font-semibold text-primary">Market position / gap:</span> {competitor.edge}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="financial" className="space-y-4">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Startup Costs (CapEx) — {cur}</CardTitle></CardHeader>
              <CardContent><CapExBarChart data={report.financials.capEx} currency={cur} /></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Operating Cost Run Rate</CardTitle></CardHeader>
              <CardContent>
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={opExData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                      <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                      <Legend />
                      <Bar dataKey="monthly" name="Monthly" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                      <Line type="monotone" dataKey="annual" name="Annual" stroke="hsl(var(--success))" strokeWidth={2.5} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Revenue Scenarios</CardTitle></CardHeader>
              <CardContent>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={scenarioData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="scenario" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                      <YAxis yAxisId="left" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                      <Legend />
                      <Bar yAxisId="left" dataKey="revenue" name="Revenue" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                      <Line yAxisId="right" type="monotone" dataKey="probability" name="Probability %" stroke="hsl(var(--warning))" strokeWidth={2.5} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Funding Mix</CardTitle></CardHeader>
              <CardContent>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={fundingData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={3}>
                        {fundingData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
          <SensitivityPanel report={report} />
        </TabsContent>

        <TabsContent value="risk" className="space-y-4">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">

            <Card>
              <CardHeader><CardTitle className="text-base">Risk Exposure Ranking</CardTitle></CardHeader>
              <CardContent>
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={riskData} layout="vertical" margin={{ top: 8, right: 24, left: 120, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" domain={[0, 9]} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" tick={{ fill: "hsl(var(--foreground))", fontSize: 10 }} width={120} />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                      <Bar dataKey="exposure" radius={[0, 6, 6, 0]}>
                        {riskData.map((item, i) => <Cell key={i} fill={item.level === "High" ? "hsl(var(--destructive))" : item.level === "Med" ? "hsl(var(--warning))" : "hsl(var(--success))"} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Top Risk Controls</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {report.risks.slice(0, 6).map((risk, i) => (
                  <div key={i} className="rounded-md border border-border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="font-semibold text-foreground">{risk.name}</div>
                      <Badge variant="outline" className={riskTone(risk.level)}>{risk.level}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{risk.mitigation}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="research" className="space-y-4">
          {research ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                    <Globe2 className="h-4 w-4 text-primary" /> Free-source market research
                    <Badge variant="outline">{research.confidence} confidence</Badge>
                    <Badge variant="outline">{research.sentiment}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed text-foreground">{research.overview}</p>
                </CardContent>
              </Card>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <MiniInsight title="Key market signals" items={research.keySignals} citations={research.citations} />
                <MiniInsight title="Customer pain points" items={research.painPoints} citations={research.citations} />
                <MiniInsight title="Reddit/community signals" items={research.redditSignals} citations={research.citations} />
                <MiniInsight title="Open web signals" items={research.webSignals} citations={research.citations} />
              </div>
              <Card>
                <CardHeader><CardTitle className="text-base">Research Citations</CardTitle></CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-2">
                  {research.citations.slice(0, 8).map((citation) => (
                    <a key={citation.url} href={citation.url} target="_blank" rel="noreferrer" className="rounded-md border border-border p-3 transition-colors hover:bg-accent">
                      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{citation.source}</div>
                      <div className="mt-1 line-clamp-2 font-medium text-foreground">{citation.title}</div>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{citation.takeaway}</p>
                    </a>
                  ))}
                </CardContent>
              </Card>
            </>
          ) : (
            <Card><CardContent className="p-6 text-sm text-muted-foreground">Run a new analysis to include free public Reddit/web research signals.</CardContent></Card>
          )}
        </TabsContent>

        <TabsContent value="roadmap" className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4 text-primary" /> Strategic Recommendations</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-foreground">
                  {report.recommendations.map((item, i) => (
                    <li key={i} className="flex gap-2"><span className="mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{i + 1}</span><span>{item}</span></li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Route className="h-4 w-4 text-primary" /> Execution Roadmap</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {report.nextSteps.map((step, i) => (
                    <div key={i} className="grid grid-cols-[2rem_1fr] gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{i + 1}</div>
                      <div className="rounded-md border border-border p-3 text-sm text-foreground">{step}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
