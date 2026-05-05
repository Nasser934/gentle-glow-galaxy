import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, BarChart3, Check, Download, FileSpreadsheet, FileText, Loader2, Presentation, Share2, ShieldCheck, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UserMenu } from "@/components/UserMenu";
import { InteractiveDashboard } from "@/components/report/InteractiveDashboard";
import { exportReportToPdf } from "@/lib/exportPdf";
import { exportReportToPptx } from "@/lib/exportPptx";
import { exportReportToXlsx } from "@/lib/exportXlsx";
import { publishReport, saveReport, unpublishReport } from "@/lib/reports";
import { safeFileName } from "@/lib/fileName";
import type { ConceptInputs, FeasibilityReport } from "@/types/analysis";

type LocationState = { report?: FeasibilityReport; inputs?: ConceptInputs; slug?: string; reportId?: string; isPublic?: boolean };
type SavedReportRef = { id: string; slug: string; is_public: boolean };

const messageFromError = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

const ResultsV2 = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const exportRootRef = useRef<HTMLDivElement>(null);
  const state = (location.state ?? {}) as LocationState;
  const report = state.report;
  const inputs = state.inputs;

  const [saved, setSaved] = useState<SavedReportRef | null>(() => state.reportId && state.slug ? { id: state.reportId, slug: state.slug, is_public: Boolean(state.isPublic) } : null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<"share" | "unshare" | "export" | null>(null);
  const [copied, setCopied] = useState(false);

  const baseFileName = useMemo(() => {
    if (!report || !inputs) return "concept-ai-report";
    return safeFileName(`${report.reportId}_${inputs.projectName}`, report.reportId || "concept-ai-report");
  }, [report, inputs]);

  useEffect(() => {
    if (!report || !inputs || saved || saving) return;
    let cancelled = false;
    setSaving(true);
    saveReport(inputs, report)
      .then((data) => { if (!cancelled) setSaved({ id: data.id, slug: data.slug, is_public: data.is_public }); })
      .catch((error: unknown) => { if (!cancelled) toast.error(messageFromError(error, "Could not save this report.")); })
      .finally(() => { if (!cancelled) setSaving(false); });
    return () => { cancelled = true; };
  }, [inputs, report, saved, saving]);

  if (!report || !inputs) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="max-w-md text-center">
          <h1 className="font-display text-2xl font-bold text-foreground">No Analysis Results</h1>
          <p className="mt-2 text-sm text-muted-foreground">Please run an analysis first.</p>
          <Button onClick={() => navigate("/analyze")} className="mt-6">Start New Analysis</Button>
        </div>
      </div>
    );
  }

  const handleShare = async () => {
    if (!saved) return toast.error("Report is still saving. Try again in a moment.");
    setBusy("share");
    try {
      const published = saved.is_public ? saved : await publishReport(saved.id);
      setSaved({ id: published.id, slug: published.slug, is_public: published.is_public });
      await navigator.clipboard.writeText(`${window.location.origin}/r/${published.slug}`);
      setCopied(true);
      toast.success("Share link published and copied.");
      window.setTimeout(() => setCopied(false), 2000);
    } catch (error: unknown) {
      toast.error(messageFromError(error, "Could not publish share link."));
    } finally {
      setBusy(null);
    }
  };

  const handleUnshare = async () => {
    if (!saved) return;
    setBusy("unshare");
    try {
      const unpublished = await unpublishReport(saved.id);
      setSaved({ id: unpublished.id, slug: unpublished.slug, is_public: unpublished.is_public });
      toast.success("Share link disabled.");
    } catch (error: unknown) {
      toast.error(messageFromError(error, "Could not disable share link."));
    } finally {
      setBusy(null);
    }
  };

  const exportPdf = async () => {
    if (!exportRootRef.current) return;
    setBusy("export");
    const id = toast.loading("Generating PDF report…");
    try {
      const result = await exportReportToPdf(exportRootRef.current, `${baseFileName}.pdf`, { report, inputs });
      toast.success(`PDF download started: ${result.fileName}`, { id });
    } catch (error: unknown) {
      toast.error(messageFromError(error, "PDF export failed."), { id });
    } finally { setBusy(null); }
  };

  const exportPptx = async () => {
    setBusy("export");
    const id = toast.loading("Generating PowerPoint deck…");
    try { await exportReportToPptx(report, inputs, `${baseFileName}.pptx`); toast.success("PowerPoint deck downloaded.", { id }); }
    catch (error: unknown) { toast.error(messageFromError(error, "PPTX export failed."), { id }); }
    finally { setBusy(null); }
  };

  const exportXlsx = async () => {
    setBusy("export");
    const id = toast.loading("Generating Excel workbook…");
    try { await exportReportToXlsx(report, inputs, `${baseFileName}.xlsx`); toast.success("Excel workbook downloaded.", { id }); }
    catch (error: unknown) { toast.error(messageFromError(error, "XLSX export failed."), { id }); }
    finally { setBusy(null); }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto flex h-14 items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2.5 text-foreground hover:text-primary">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15 ring-1 ring-inset ring-primary/30"><BarChart3 className="h-3.5 w-3.5 text-primary" /></div>
            <span className="text-[15px] font-medium tracking-tight">Concept AI</span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="outline" size="sm" onClick={() => navigate("/analyze")} className="h-8 gap-1.5"><ArrowLeft className="h-3.5 w-3.5" /> New</Button>
            <Button variant="outline" size="sm" onClick={handleShare} disabled={saving || busy === "share"} className="h-8 gap-1.5">
              {busy === "share" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : copied ? <Check className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
              {copied ? "Copied" : saved?.is_public ? "Copy Link" : "Share"}
            </Button>
            {saved?.is_public && <Button variant="outline" size="sm" onClick={handleUnshare} disabled={busy === "unshare"} className="h-8 gap-1.5">{busy === "unshare" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />} Unshare</Button>}
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button size="sm" disabled={busy === "export"} className="h-8 gap-1.5">{busy === "export" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Export</Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={exportPdf} className="gap-2"><FileText className="h-4 w-4 text-primary" /> PDF report (.pdf)</DropdownMenuItem>
                <DropdownMenuItem onClick={exportPptx} className="gap-2"><Presentation className="h-4 w-4 text-primary" /> Executive deck (.pptx)</DropdownMenuItem>
                <DropdownMenuItem onClick={exportXlsx} className="gap-2"><FileSpreadsheet className="h-4 w-4 text-primary" /> Financial workbook (.xlsx)</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <UserMenu />
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary ring-1 ring-inset ring-primary/20"><ShieldCheck className="h-3.5 w-3.5" /> {saved?.is_public ? "Shared by link" : "Private report"}</div>
            <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{inputs.projectName}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{inputs.industry || "Unspecified industry"}{inputs.location ? ` · ${inputs.location}` : ""} · Report {report.reportId}</p>
          </div>
          <div className="rounded-xl border border-border/60 bg-card/50 px-4 py-3 text-sm">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Verdict</div>
            <div className="mt-1 font-display text-lg font-semibold text-primary">{report.scores.verdict}</div>
            <div className="text-xs text-muted-foreground">Overall {report.scores.overall.toFixed(1)} / 10</div>
          </div>
        </div>
        <div ref={exportRootRef}><InteractiveDashboard report={report} inputs={inputs} /></div>
      </main>
    </div>
  );
};

export default ResultsV2;
