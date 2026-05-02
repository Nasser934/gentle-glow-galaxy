import { useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, BarChart3, Download, FileSpreadsheet, FileText, Loader2, Presentation, Share2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UserMenu } from "@/components/UserMenu";
import { toast } from "sonner";
import type { ConceptInputs, FeasibilityReport } from "@/types/analysis";
import { FMARTRadar } from "@/components/report/FMARTRadar";
import { MarketGrowthChart } from "@/components/report/MarketGrowthChart";
import { CapExBarChart } from "@/components/report/CapExBarChart";
import { exportReportToPdf } from "@/lib/exportPdf";
import { exportReportToPptx } from "@/lib/exportPptx";
import { exportReportToXlsx } from "@/lib/exportXlsx";
import { InteractiveDashboard } from "@/components/report/InteractiveDashboard";
import { DashboardSnapshot } from "@/components/report/DashboardSnapshot";
import { saveReport } from "@/lib/reports";

/* ------------------------------------------------------------------ */
/* Page chrome                                                         */
/* ------------------------------------------------------------------ */
const ReportPage = ({
  pageNum, total, projectName, children,
}: { pageNum: number; total: number; projectName: string; children: React.ReactNode }) => (
  <div
    data-pdf-page
    className="report-page relative mx-auto bg-white text-[#0f172a] shadow-xl"
    style={{ width: "794px", minHeight: "1123px", padding: "48px 56px 72px", boxSizing: "border-box", fontFamily: "Inter, sans-serif" }}
  >
    <div className="mb-6 flex items-center justify-between border-b-2 border-[#1f4ed8] pb-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#1f4ed8]">
        AI Feasibility Engine · Confidential
      </div>
      <div className="text-[10px] font-medium uppercase tracking-wider text-[#64748b]">
        {projectName} · Page {pageNum}/{total}
      </div>
    </div>
    <div className="report-body">{children}</div>
    <div className="absolute bottom-6 left-14 right-14 flex items-center justify-between border-t border-[#e2e8f0] pt-3 text-[9px] uppercase tracking-wider text-[#94a3b8]">
      <span>Confidential · AI-Generated · Not financial advice</span>
      <span>{new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</span>
    </div>
  </div>
);

const SectionTitle = ({ n, children }: { n: string; children: React.ReactNode }) => (
  <h2 className="mb-3 mt-1 font-display text-[15px] font-bold uppercase tracking-wide text-[#0f172a]">
    <span className="mr-2 text-[#1f4ed8]">{n}.</span>{children}
  </h2>
);

const SubTitle = ({ children }: { children: React.ReactNode }) => (
  <h3 className="mb-2 mt-3 font-display text-[12px] font-semibold uppercase tracking-wide text-[#334155]">{children}</h3>
);

const verdictColor = (v: string) =>
  v === "PROCEED" ? "bg-emerald-600 text-white"
  : v === "PROCEED WITH CAUTION" ? "bg-amber-500 text-white"
  : v === "REVISE" ? "bg-orange-500 text-white"
  : "bg-rose-600 text-white";

const riskBadge = (lvl: string) =>
  lvl === "Low" ? "bg-emerald-100 text-emerald-800"
  : lvl === "Med" ? "bg-amber-100 text-amber-800"
  : "bg-rose-100 text-rose-800";

const fmtNum = (n: number) => n.toLocaleString("en-US");

/* ------------------------------------------------------------------ */
const Results = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const pdfRootRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [shareSlug, setShareSlug] = useState<string | null>(null);
  const [savingShare, setSavingShare] = useState(false);
  const [copied, setCopied] = useState(false);

  const report = location.state?.report as FeasibilityReport | undefined;
  const inputs = location.state?.inputs as ConceptInputs | undefined;
  const existingSlug = location.state?.slug as string | undefined;

  useEffect(() => {
    if (existingSlug) setShareSlug(existingSlug);
  }, [existingSlug]);

  // Auto-save once on first load
  useEffect(() => {
    if (!report || !inputs || existingSlug || shareSlug) return;
    let cancelled = false;
    saveReport(inputs, report)
      .then((d) => { if (!cancelled) setShareSlug(d.slug); })
      .catch((e) => console.warn("auto-save failed", e));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!report || !inputs) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <h2 className="font-display text-2xl font-bold text-foreground">No Analysis Results</h2>
          <p className="mt-2 text-muted-foreground">Please run an analysis first.</p>
          <Button onClick={() => navigate("/analyze")} className="mt-6">Start New Analysis</Button>
        </div>
      </div>
    );
  }

  const handleDownload = async () => {
    if (!pdfRootRef.current) return;
    setDownloading(true);
    const toastId = toast.loading("Generating PDF file…");
    try {
      const result = await exportReportToPdf(pdfRootRef.current, `${report.reportId}_${inputs.projectName.replace(/\s+/g, "_")}.pdf`);
      toast.success(`PDF download started: ${result.fileName}`, { id: toastId });
    } catch (e: any) {
      toast.error(e?.message || "PDF export failed.", { id: toastId });
    } finally {
      setDownloading(false);
    }
  };

  const handleExportPptx = async () => {
    setDownloading(true);
    const id = toast.loading("Generating PowerPoint deck…");
    try {
      const baseName = `${report.reportId}_${inputs.projectName.replace(/\s+/g, "_")}`;
      await exportReportToPptx(report, inputs, `${baseName}.pptx`);
      toast.success("Deck downloaded", { id });
    } catch (e: any) { toast.error(e?.message || "PPTX export failed", { id }); }
    finally { setDownloading(false); }
  };

  const handleExportXlsx = async () => {
    setDownloading(true);
    const id = toast.loading("Generating Excel workbook…");
    try {
      const baseName = `${report.reportId}_${inputs.projectName.replace(/\s+/g, "_")}`;
      await exportReportToXlsx(report, inputs, `${baseName}.xlsx`);
      toast.success("Workbook downloaded", { id });
    } catch (e: any) { toast.error(e?.message || "XLSX export failed", { id }); }
    finally { setDownloading(false); }
  };

  const handleShare = async () => {
    let slug = shareSlug;
    if (!slug) {
      setSavingShare(true);
      try { const d = await saveReport(inputs, report); slug = d.slug; setShareSlug(slug); }
      catch (e: any) { toast.error(e.message); setSavingShare(false); return; }
      setSavingShare(false);
    }
    const url = `${window.location.origin}/r/${slug}`;
    try { await navigator.clipboard.writeText(url); setCopied(true); toast.success("Share link copied"); setTimeout(() => setCopied(false), 2000); }
    catch { toast.info(url); }
  };

  const totalPages = 9; // 1 dashboard snapshot + 8 report pages
  const cur = report.financials.currency;

  return (
    <div className="min-h-screen bg-[#eef2f7]">
      {/* Top toolbar */}
      <nav className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl no-print">
        <div className="container mx-auto flex h-14 items-center justify-between px-6">
          <button onClick={() => navigate("/")} className="flex items-center gap-2.5 text-foreground transition-colors hover:text-primary">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15 ring-1 ring-inset ring-primary/30">
              <BarChart3 className="h-3.5 w-3.5 text-primary" />
            </div>
            <span className="text-[15px] font-medium tracking-tight">Concept AI</span>
          </button>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="outline" size="sm" onClick={() => navigate("/analyze")} className="h-8 gap-1.5 rounded-md border-border/70 bg-card/40 px-3 text-[13px] font-medium hover:bg-card">
              <ArrowLeft className="h-3.5 w-3.5" /> New
            </Button>
            <Button variant="outline" size="sm" onClick={handleShare} disabled={savingShare} className="h-8 gap-1.5 rounded-md border-border/70 bg-card/40 px-3 text-[13px] font-medium hover:bg-card">
              {savingShare ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : copied ? <Check className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Share"}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" disabled={downloading} className="h-8 gap-1.5 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground hover:bg-primary/90">
                  {downloading
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…</>
                    : <><Download className="h-3.5 w-3.5" /> Export</>}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={handleDownload} className="gap-2"><FileText className="h-4 w-4 text-primary" /> PDF report (.pdf)</DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportPptx} className="gap-2"><Presentation className="h-4 w-4 text-primary" /> Executive deck (.pptx)</DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportXlsx} className="gap-2"><FileSpreadsheet className="h-4 w-4 text-primary" /> Financial workbook (.xlsx)</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <UserMenu />
          </div>
        </div>
      </nav>

      {/* Interactive dashboard (the only on-screen view) */}
      <div className="container mx-auto px-6 py-8 no-print">
        <InteractiveDashboard report={report} inputs={inputs} />
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/40 p-5">
          <div>
            <h3 className="font-display text-lg font-semibold text-foreground">Printable PDF report</h3>
            <p className="text-sm text-muted-foreground">8-page A4 document, designed separately from the dashboard. Download to view.</p>
          </div>
          <Button onClick={handleDownload} disabled={downloading} className="gap-2">
            {downloading
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating PDF…</>
              : <><Download className="h-4 w-4" /> Download Report PDF</>}
          </Button>
        </div>
      </div>

      {/* PDF root — rendered off-screen for html2canvas capture only */}
      <div
        aria-hidden="true"
        style={{ position: "fixed", left: "-10000px", top: 0, width: "794px", pointerEvents: "none" }}
      >
        <div ref={pdfRootRef} className="space-y-6 py-8 bg-white">

        {/* ============== PAGE 1 — COVER ============== */}
        <ReportPage pageNum={2} total={totalPages} projectName={inputs.projectName}>
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.3em] text-[#64748b]">Project</div>
          <h1 className="mb-1 font-display text-[42px] font-extrabold leading-tight text-[#0f172a]">FEASIBILITY REPORT</h1>
          <p className="mb-8 text-[15px] text-[#475569]">{inputs.projectName}{inputs.location ? ` — ${inputs.location}` : ""}</p>

          <div className="mb-6 grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-5">
              <div className="text-[9px] font-bold uppercase tracking-wider text-[#64748b]">Overall Score</div>
              <div className="mt-1 font-display text-4xl font-bold text-[#1f4ed8]">{report.scores.overall.toFixed(1)} <span className="text-base font-normal text-[#64748b]">/ 10</span></div>
            </div>
            <div className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-5">
              <div className="text-[9px] font-bold uppercase tracking-wider text-[#64748b]">Verdict</div>
              <div className={`mt-1 inline-block rounded-md px-3 py-1 font-display text-sm font-bold ${verdictColor(report.scores.verdict)}`}>
                {report.scores.verdict}
              </div>
            </div>
            <div className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-5">
              <div className="text-[9px] font-bold uppercase tracking-wider text-[#64748b]">Investment</div>
              <div className="mt-1 font-display text-xl font-semibold text-[#0f172a]">{report.financials.investmentRange}</div>
            </div>
            <div className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-5">
              <div className="text-[9px] font-bold uppercase tracking-wider text-[#64748b]">Break-Even</div>
              <div className="mt-1 font-display text-xl font-semibold text-[#0f172a]">{report.financials.breakEvenSummary}</div>
            </div>
          </div>

          <div className="space-y-1.5 text-[12px] text-[#334155]">
            <p><strong className="text-[#0f172a]">Report ID:</strong> {report.reportId}</p>
            <p><strong className="text-[#0f172a]">Date Issued:</strong> {report.dateIssued}</p>
            <p><strong className="text-[#0f172a]">Classification:</strong> {report.classification}</p>
            <p><strong className="text-[#0f172a]">Prepared by:</strong> {report.preparedBy}</p>
            <p><strong className="text-[#0f172a]">Methodology:</strong> {report.methodology}</p>
          </div>

          <p className="mt-6 text-[10px] italic leading-relaxed text-[#64748b]">
            Auto-generated by AI analysis engine using market intelligence and structured reasoning.
            Does not constitute financial or legal advice.
          </p>
        </ReportPage>

        {/* ============== PAGE 2 — EXECUTIVE SUMMARY + RADAR ============== */}
        <ReportPage pageNum={3} total={totalPages} projectName={inputs.projectName}>
          <SectionTitle n="1">Executive Summary</SectionTitle>
          <p className="mb-4 whitespace-pre-line text-[12px] leading-relaxed text-[#334155]">{report.executiveSummary}</p>

          <table className="mb-4 w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-[#1f4ed8] text-white">
                <th className="border border-[#1f4ed8] px-3 py-2 text-left font-semibold">Dimension</th>
                <th className="border border-[#1f4ed8] px-3 py-2 text-left font-semibold">Score</th>
                <th className="border border-[#1f4ed8] px-3 py-2 text-left font-semibold">Key Finding</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Financial Feasibility", report.scores.financial, report.scores.financialFinding],
                ["Market Attractiveness", report.scores.market, report.scores.marketFinding],
                ["Technical Achievability", report.scores.achievability, report.scores.achievabilityFinding],
                ["Operational Feasibility", report.scores.operational, report.scores.operationalFinding],
                ["Risk Level (inv.)", report.scores.risk, report.scores.riskFinding],
                ["Market Timing", report.scores.timing, report.scores.timingFinding],
              ].map(([label, score, finding]) => (
                <tr key={label as string} className="even:bg-[#f8fafc]">
                  <td className="border border-[#e2e8f0] px-3 py-2 text-[#0f172a]">{label}</td>
                  <td className="border border-[#e2e8f0] px-3 py-2 font-semibold text-[#1f4ed8]">{(score as number).toFixed(1)} / 10</td>
                  <td className="border border-[#e2e8f0] px-3 py-2 text-[#334155]">{finding as string}</td>
                </tr>
              ))}
              <tr className="bg-[#eff6ff] font-bold">
                <td className="border border-[#1f4ed8] px-3 py-2 text-[#1f4ed8]">OVERALL WEIGHTED SCORE</td>
                <td className="border border-[#1f4ed8] px-3 py-2 text-[#1f4ed8]">{report.scores.overall.toFixed(1)} / 10</td>
                <td className="border border-[#1f4ed8] px-3 py-2 text-[#1f4ed8]">RECOMMENDED — {report.scores.verdict}</td>
              </tr>
            </tbody>
          </table>

          <SubTitle>Figure 1 — FMART 5-Dimension Score Radar (Overall: {report.scores.overall.toFixed(1)}/10)</SubTitle>
          <FMARTRadar scores={report.scores} />
        </ReportPage>

        {/* ============== PAGE 3 — MARKET ANALYSIS ============== */}
        <ReportPage pageNum={4} total={totalPages} projectName={inputs.projectName}>
          <SectionTitle n="2">Market Analysis</SectionTitle>

          <SubTitle>2.1 Market Sizing (TAM · SAM · SOM)</SubTitle>
          <table className="mb-4 w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-[#1f4ed8] text-white">
                <th className="border border-[#1f4ed8] px-3 py-2 text-left">Level</th>
                <th className="border border-[#1f4ed8] px-3 py-2 text-left">Definition</th>
                <th className="border border-[#1f4ed8] px-3 py-2 text-left">Value</th>
                <th className="border border-[#1f4ed8] px-3 py-2 text-left">CAGR</th>
              </tr>
            </thead>
            <tbody>
              <tr><td className="border border-[#e2e8f0] px-3 py-2 font-semibold">TAM — Total</td><td className="border border-[#e2e8f0] px-3 py-2">{report.market.tamLabel}</td><td className="border border-[#e2e8f0] px-3 py-2 text-[#1f4ed8] font-semibold">{report.market.tamValue}</td><td className="border border-[#e2e8f0] px-3 py-2">{report.market.tamCagr}</td></tr>
              <tr className="bg-[#f8fafc]"><td className="border border-[#e2e8f0] px-3 py-2 font-semibold">SAM — Serviceable</td><td className="border border-[#e2e8f0] px-3 py-2">{report.market.samLabel}</td><td className="border border-[#e2e8f0] px-3 py-2 text-[#1f4ed8] font-semibold">{report.market.samValue}</td><td className="border border-[#e2e8f0] px-3 py-2">{report.market.samCagr}</td></tr>
              <tr><td className="border border-[#e2e8f0] px-3 py-2 font-semibold">SOM — Obtainable</td><td className="border border-[#e2e8f0] px-3 py-2">{report.market.somLabel}</td><td className="border border-[#e2e8f0] px-3 py-2 text-[#1f4ed8] font-semibold">{report.market.somValue}</td><td className="border border-[#e2e8f0] px-3 py-2">{report.market.somCagr}</td></tr>
            </tbody>
          </table>

          <SubTitle>Figure 2 — Market Growth: TAM vs SAM</SubTitle>
          <MarketGrowthChart data={report.market.growthChart} currency={report.market.currency} />

          <SubTitle>2.2 Target Customer Profile</SubTitle>
          <table className="w-full border-collapse text-[11px]">
            <tbody>
              <tr><td className="w-1/3 border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2 font-semibold">Age & Location</td><td className="border border-[#e2e8f0] px-3 py-2">{report.customer.ageLocation}</td></tr>
              <tr><td className="border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2 font-semibold">Income</td><td className="border border-[#e2e8f0] px-3 py-2">{report.customer.income}</td></tr>
              <tr><td className="border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2 font-semibold">Goals</td><td className="border border-[#e2e8f0] px-3 py-2">{report.customer.goals}</td></tr>
              <tr><td className="border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2 font-semibold">Willingness to Pay</td><td className="border border-[#e2e8f0] px-3 py-2">{report.customer.willingnessToPay}</td></tr>
              <tr><td className="border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2 font-semibold">Behavior</td><td className="border border-[#e2e8f0] px-3 py-2">{report.customer.behavior}</td></tr>
            </tbody>
          </table>
        </ReportPage>

        {/* ============== PAGE 4 — PUBLIC RESEARCH ============== */}
        <ReportPage pageNum={5} total={totalPages} projectName={inputs.projectName}>
          <SectionTitle n="3">Public Market Research</SectionTitle>
          {report.research ? (
            <>
              <div className="mb-4 rounded-md border border-[#dbeafe] bg-[#eff6ff] p-4">
                <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[#1f4ed8]">
                  Free-source insight · {report.research.confidence} confidence · {report.research.sentiment} sentiment
                </div>
                <p className="text-[11px] leading-relaxed text-[#334155]">{report.research.overview}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <SubTitle>Key Signals</SubTitle>
                  <ul className="space-y-1.5 text-[10.5px] text-[#334155]">
                    {report.research.keySignals.slice(0, 6).map((s, i) => <li key={i} className="flex gap-2"><span className="text-[#1f4ed8]">■</span><span>{s}</span></li>)}
                  </ul>
                </div>
                <div>
                  <SubTitle>Customer Pain Points</SubTitle>
                  <ul className="space-y-1.5 text-[10.5px] text-[#334155]">
                    {report.research.painPoints.slice(0, 6).map((s, i) => <li key={i} className="flex gap-2"><span className="text-[#1f4ed8]">■</span><span>{s}</span></li>)}
                  </ul>
                </div>
              </div>

              <SubTitle>Community + Web Evidence</SubTitle>
              <table className="w-full border-collapse text-[10px]">
                <thead>
                  <tr className="bg-[#1f4ed8] text-white">
                    <th className="border border-[#1f4ed8] px-2 py-1.5 text-left">Source</th>
                    <th className="border border-[#1f4ed8] px-2 py-1.5 text-left">Signal</th>
                    <th className="border border-[#1f4ed8] px-2 py-1.5 text-left">Takeaway</th>
                  </tr>
                </thead>
                <tbody>
                  {report.research.citations.slice(0, 8).map((c, i) => (
                    <tr key={c.url} className={i % 2 ? "bg-[#f8fafc]" : ""}>
                      <td className="border border-[#e2e8f0] px-2 py-1.5 font-semibold text-[#0f172a]">{c.source}</td>
                      <td className="border border-[#e2e8f0] px-2 py-1.5 text-[#334155]">{c.title}</td>
                      <td className="border border-[#e2e8f0] px-2 py-1.5 text-[#475569]">{c.takeaway}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <p className="text-[12px] text-[#475569]">Run a new analysis to include public Reddit/web research evidence in this report.</p>
          )}
        </ReportPage>

        {/* ============== PAGE 5 — COMPETITORS ============== */}
        <ReportPage pageNum={6} total={totalPages} projectName={inputs.projectName}>
          <SectionTitle n="3">Competitive Landscape</SectionTitle>
          <SubTitle>3.1 Direct Competitors</SubTitle>
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-[#1f4ed8] text-white">
                <th className="border border-[#1f4ed8] px-3 py-2 text-left">Company</th>
                <th className="border border-[#1f4ed8] px-3 py-2 text-left">Model</th>
                <th className="border border-[#1f4ed8] px-3 py-2 text-left">Weakness</th>
                <th className="border border-[#1f4ed8] px-3 py-2 text-left">Your Edge</th>
              </tr>
            </thead>
            <tbody>
              {report.competitors.map((c, i) => (
                <tr key={c.name} className={i % 2 ? "bg-[#f8fafc]" : ""}>
                  <td className="border border-[#e2e8f0] px-3 py-2 font-semibold text-[#0f172a]">{c.name}</td>
                  <td className="border border-[#e2e8f0] px-3 py-2 text-[#334155]">{c.model}</td>
                  <td className="border border-[#e2e8f0] px-3 py-2 text-[#334155]">{c.weakness}</td>
                  <td className="border border-[#e2e8f0] px-3 py-2 text-[#1f4ed8] font-medium">{c.edge}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ReportPage>

        {/* ============== PAGE 6 — CAPEX ============== */}
        <ReportPage pageNum={7} total={totalPages} projectName={inputs.projectName}>
          <SectionTitle n="4">Financial Plan</SectionTitle>
          <SubTitle>4.1 Startup Costs (CapEx) — {cur}</SubTitle>
          <table className="mb-4 w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-[#1f4ed8] text-white">
                <th className="border border-[#1f4ed8] px-3 py-2 text-left">Category</th>
                <th className="border border-[#1f4ed8] px-3 py-2 text-right">Low</th>
                <th className="border border-[#1f4ed8] px-3 py-2 text-right">High</th>
                <th className="border border-[#1f4ed8] px-3 py-2 text-left">Notes</th>
              </tr>
            </thead>
            <tbody>
              {report.financials.capEx.map((c, i) => (
                <tr key={c.category} className={i % 2 ? "bg-[#f8fafc]" : ""}>
                  <td className="border border-[#e2e8f0] px-3 py-2 font-semibold text-[#0f172a]">{c.category}</td>
                  <td className="border border-[#e2e8f0] px-3 py-2 text-right">{fmtNum(c.low)}</td>
                  <td className="border border-[#e2e8f0] px-3 py-2 text-right">{fmtNum(c.high)}</td>
                  <td className="border border-[#e2e8f0] px-3 py-2 text-[#475569]">{c.notes}</td>
                </tr>
              ))}
              <tr className="bg-[#eff6ff] font-bold text-[#1f4ed8]">
                <td className="border border-[#1f4ed8] px-3 py-2">TOTAL</td>
                <td className="border border-[#1f4ed8] px-3 py-2 text-right">{fmtNum(report.financials.capExTotal.low)}</td>
                <td className="border border-[#1f4ed8] px-3 py-2 text-right">{fmtNum(report.financials.capExTotal.high)}</td>
                <td className="border border-[#1f4ed8] px-3 py-2">Mid: {fmtNum(report.financials.capExTotal.mid)}</td>
              </tr>
            </tbody>
          </table>

          <SubTitle>Figure 3 — Startup Cost Breakdown</SubTitle>
          <CapExBarChart data={report.financials.capEx} currency={cur} />
        </ReportPage>

        {/* ============== PAGE 7 — OPEX + SCENARIOS ============== */}
        <ReportPage pageNum={8} total={totalPages} projectName={inputs.projectName}>
          <SubTitle>4.2 Monthly Operating Costs — {cur}</SubTitle>
          <table className="mb-5 w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-[#1f4ed8] text-white">
                <th className="border border-[#1f4ed8] px-3 py-2 text-left">Category</th>
                <th className="border border-[#1f4ed8] px-3 py-2 text-right">Monthly</th>
                <th className="border border-[#1f4ed8] px-3 py-2 text-right">Annual</th>
              </tr>
            </thead>
            <tbody>
              {report.financials.opEx.map((o, i) => (
                <tr key={o.category} className={i % 2 ? "bg-[#f8fafc]" : ""}>
                  <td className="border border-[#e2e8f0] px-3 py-2 font-semibold text-[#0f172a]">{o.category}</td>
                  <td className="border border-[#e2e8f0] px-3 py-2 text-right">{fmtNum(o.monthly)}</td>
                  <td className="border border-[#e2e8f0] px-3 py-2 text-right">{fmtNum(o.annual)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <SubTitle>4.3 Revenue Scenarios</SubTitle>
          <table className="mb-3 w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-[#1f4ed8] text-white">
                <th className="border border-[#1f4ed8] px-3 py-2 text-left">Scenario</th>
                <th className="border border-[#1f4ed8] px-3 py-2 text-left">Probability</th>
                <th className="border border-[#1f4ed8] px-3 py-2 text-left">Yr 1 Customers</th>
                <th className="border border-[#1f4ed8] px-3 py-2 text-left">Annual Revenue</th>
                <th className="border border-[#1f4ed8] px-3 py-2 text-left">Break-Even</th>
              </tr>
            </thead>
            <tbody>
              {report.financials.scenarios.map((s, i) => (
                <tr key={s.scenario} className={i % 2 ? "bg-[#f8fafc]" : ""}>
                  <td className="border border-[#e2e8f0] px-3 py-2 font-semibold">
                    <span className={`mr-2 inline-block h-2 w-2 rounded-full ${
                      s.scenario === "Optimistic" ? "bg-emerald-500" : s.scenario === "Base Case" ? "bg-[#1f4ed8]" : "bg-rose-500"
                    }`} />
                    {s.scenario}
                  </td>
                  <td className="border border-[#e2e8f0] px-3 py-2">{s.probability}</td>
                  <td className="border border-[#e2e8f0] px-3 py-2">{s.subscribersYr1}</td>
                  <td className="border border-[#e2e8f0] px-3 py-2 text-[#1f4ed8] font-semibold">{s.annualRevenue}</td>
                  <td className="border border-[#e2e8f0] px-3 py-2">{s.breakEven}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {report.financials.ltvCacRatio && (
            <p className="text-[11px] italic text-[#475569]">LTV/CAC ratio (base case): <strong className="text-[#0f172a] not-italic">{report.financials.ltvCacRatio}</strong></p>
          )}
        </ReportPage>

        {/* ============== PAGE 8 — RISKS + FUNDING + RECS ============== */}
        <ReportPage pageNum={9} total={totalPages} projectName={inputs.projectName}>
          <SectionTitle n="5">Risk Assessment</SectionTitle>
          <table className="mb-5 w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-[#1f4ed8] text-white">
                <th className="border border-[#1f4ed8] px-3 py-2 text-left">Risk</th>
                <th className="border border-[#1f4ed8] px-3 py-2 text-center">Prob.</th>
                <th className="border border-[#1f4ed8] px-3 py-2 text-center">Impact</th>
                <th className="border border-[#1f4ed8] px-3 py-2 text-center">Level</th>
                <th className="border border-[#1f4ed8] px-3 py-2 text-left">Mitigation</th>
              </tr>
            </thead>
            <tbody>
              {report.risks.map((r, i) => (
                <tr key={r.name + i} className={i % 2 ? "bg-[#f8fafc]" : ""}>
                  <td className="border border-[#e2e8f0] px-3 py-2 font-semibold text-[#0f172a]">{r.name}</td>
                  <td className="border border-[#e2e8f0] px-3 py-2 text-center">{r.probability}</td>
                  <td className="border border-[#e2e8f0] px-3 py-2 text-center">{r.impact}</td>
                  <td className="border border-[#e2e8f0] px-3 py-2 text-center">
                    <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${riskBadge(r.level)}`}>{r.level}</span>
                  </td>
                  <td className="border border-[#e2e8f0] px-3 py-2 text-[#475569]">{r.mitigation}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <SectionTitle n="6">Funding Mix</SectionTitle>
          <table className="mb-3 w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-[#1f4ed8] text-white">
                <th className="border border-[#1f4ed8] px-3 py-2 text-left">Source</th>
                <th className="border border-[#1f4ed8] px-3 py-2 text-left">Share</th>
                <th className="border border-[#1f4ed8] px-3 py-2 text-left">Amount ({cur})</th>
                <th className="border border-[#1f4ed8] px-3 py-2 text-left">Rationale</th>
              </tr>
            </thead>
            <tbody>
              {report.fundingMix.map((f, i) => (
                <tr key={f.source} className={i % 2 ? "bg-[#f8fafc]" : ""}>
                  <td className="border border-[#e2e8f0] px-3 py-2 font-semibold">{f.source}</td>
                  <td className="border border-[#e2e8f0] px-3 py-2">{f.share}</td>
                  <td className="border border-[#e2e8f0] px-3 py-2">{f.amount}</td>
                  <td className="border border-[#e2e8f0] px-3 py-2 text-[#475569]">{f.rationale}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mb-4 rounded-md border-l-4 border-amber-500 bg-amber-50 p-3 text-[11px] text-[#78350f]">
            <strong>■ ADVISORY:</strong> {report.fundingAdvisory}
          </div>

          <SectionTitle n="7">Strategic Recommendations</SectionTitle>
          <ul className="mb-4 space-y-1.5 text-[11px] text-[#334155]">
            {report.recommendations.map((r, i) => (
              <li key={i} className="flex gap-2"><span className="text-[#1f4ed8]">■</span><span>{r}</span></li>
            ))}
          </ul>

          <SectionTitle n="8">Next Steps</SectionTitle>
          <ol className="list-decimal space-y-1 pl-5 text-[11px] text-[#334155]">
            {report.nextSteps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
        </ReportPage>
        </div>
      </div>
    </div>
  );
};

export default Results;
