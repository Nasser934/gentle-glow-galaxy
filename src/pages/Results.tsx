import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Download, FileSpreadsheet, FileText, Loader2, Presentation, Share2, Check, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { toast } from "sonner";
import type { ConceptInputs, FeasibilityReport } from "@/types/analysis";
import { FMARTRadar } from "@/components/report/FMARTRadar";
import { MarketGrowthChart } from "@/components/report/MarketGrowthChart";
import { CapExBarChart } from "@/components/report/CapExBarChart";
import { exportReportToPdf, type VersionFamilyEntry } from "@/lib/exportPdf";
import { exportReportToPptx } from "@/lib/exportPptx";
import { exportReportToXlsx } from "@/lib/exportXlsx";
import { InteractiveDashboard } from "@/components/report/InteractiveDashboard";
import { saveReport, getReportById, listReportVersions, restoreReportGroup, type ReportRow } from "@/lib/reports";
import { ensureEvidenceFields } from "@/lib/evidence";
import { EvidenceSections } from "@/components/report/evidence/EvidencePanel";
import { useAuth } from "@/contexts/AuthContext";

/* ------------------------------------------------------------------ */
const Results = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { reportId: routeReportId } = useParams();
  const { user } = useAuth();
  const captureRootRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [shareSlug, setShareSlug] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(routeReportId ?? null);
  const [savingShare, setSavingShare] = useState(false);
  const [copied, setCopied] = useState(false);

  const stateReport = location.state?.report as FeasibilityReport | undefined;
  const stateInputs = location.state?.inputs as ConceptInputs | undefined;
  const existingSlug = location.state?.slug as string | undefined;
  const existingId = location.state?.reportId as string | undefined;
  const stateOwnerId = location.state?.ownerId as string | undefined;
  const readOnlyFlag = location.state?.readOnly === true;

  // Fetched payload when arriving via /reports/:id without navigation state.
  const [fetched, setFetched] = useState<ReportRow | null>(null);
  const [fetchState, setFetchState] = useState<"idle" | "loading" | "not_found" | "forbidden" | "ok">(
    routeReportId && !stateReport ? "loading" : "idle",
  );

  const rawReport: FeasibilityReport | undefined = stateReport ?? (fetched?.output as FeasibilityReport | undefined);
  const inputs: ConceptInputs | undefined = stateInputs ?? (fetched?.inputs as ConceptInputs | undefined);
  const report = useMemo(
    () => (rawReport && inputs ? ensureEvidenceFields(rawReport, inputs) : rawReport),
    [rawReport, inputs],
  );

  // Refresh-safe ownership: trust the DB, not just route state.
  const [ownerId, setOwnerId] = useState<string | null>(stateOwnerId ?? null);
  const [archivedAt, setArchivedAt] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  // Hydrate slug/id from navigation state if present.
  useEffect(() => {
    if (existingSlug) setShareSlug(existingSlug);
    if (existingId && !routeReportId) setReportId(existingId);
  }, [existingSlug, existingId, routeReportId]);

  // /results legacy upgrade: if we landed on /results but we *do* have an id
  // (from state or sessionStorage), upgrade the URL to /reports/:id.
  // If only state.report/inputs are present (unsaved, just-finished analysis),
  // do NOT redirect — keep rendering so auto-save/export still work.
  useEffect(() => {
    if (routeReportId) return; // already on canonical URL
    if (existingId) {
      navigate(`/reports/${existingId}`, { replace: true, state: location.state });
      return;
    }
    if (!stateReport) {
      let cached: string | null = null;
      try { cached = sessionStorage.getItem("conceptai:currentReportId"); } catch { /* ignore */ }
      if (cached) navigate(`/reports/${cached}`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Expose the currently viewed report so the sidebar's Decision Room link can target it.
  useEffect(() => {
    if (reportId) {
      try { sessionStorage.setItem("conceptai:currentReportId", reportId); } catch { /* ignore */ }
    }
  }, [reportId]);

  // Fetch path for refresh-safe /reports/:id (no navigation state).
  useEffect(() => {
    if (!routeReportId) return;
    if (stateReport) {
      // Got the payload via state — record ownership.
      // Freshly-saved owner path: Analyze.tsx just saved this report as the
      // current user, so trust user.id locally for canEdit. We still verify
      // ownership against the DB in the background below.
      if (stateOwnerId && !ownerId) {
        setOwnerId(stateOwnerId);
      } else if (!ownerId && user) {
        setOwnerId(user.id);
      }
      // Background verification — corrects ownerId if the row is not actually
      // owned by this user (e.g. crafted navigation state). RLS still protects
      // writes server-side, but this keeps UI honest.
      let cancelled = false;
      getReportById(routeReportId)
        .then((row) => {
          if (cancelled || !row) return;
          if (row.user_id !== ownerId) setOwnerId(row.user_id);
          if (row.slug && !shareSlug) setShareSlug(row.slug);
          setArchivedAt(row.archived_at ?? null);
        })
        .catch(() => { /* non-fatal */ });
      return () => { cancelled = true; };
    }
    let cancelled = false;
    setFetchState("loading");
    getReportById(routeReportId)
      .then((row) => {
        if (cancelled) return;
        if (!row) { setFetchState("not_found"); return; }
        // Non-owner: only redirect to /r/:slug when both slug and public flag are safe.
        if (user && row.user_id !== user.id) {
          if (row.is_public && row.slug) {
            navigate(`/r/${row.slug}`, { replace: true });
            return;
          }
          setFetchState("forbidden");
          return;
        }
        setFetched(row);
        setOwnerId(row.user_id);
        setShareSlug(row.slug);
        setReportId(row.id);
        setArchivedAt(row.archived_at ?? null);
        setFetchState("ok");
      })
      .catch(() => { if (!cancelled) setFetchState("not_found"); });
    return () => { cancelled = true; };
  }, [routeReportId, stateReport, stateOwnerId, user, navigate, ownerId, shareSlug]);

  const canEdit = !readOnlyFlag && (!reportId || (!!user && !!ownerId && user.id === ownerId));

  // Auto-save once on first load — never in read-only/shared view, and never
  // when we already have a reportId (Analyze.tsx now saves before navigating,
  // and refresh-fetch hydrates an existing row). This guarantees one row per
  // analysis unless the user explicitly re-runs.
  useEffect(() => {
    if (readOnlyFlag) return;
    if (!report || !inputs) return;
    if (reportId || existingId || routeReportId) return;
    if (existingSlug || shareSlug) return;
    let cancelled = false;
    saveReport(inputs, report)
      .then((d) => {
        if (cancelled) return;
        setShareSlug(d.slug);
        setReportId(d.id);
        setOwnerId(user?.id ?? null);
        // Upgrade the URL to the canonical owner workspace.
        navigate(`/reports/${d.id}`, { replace: true, state: location.state });
      })
      .catch((e) => console.warn("auto-save failed", e));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Loading state for refresh-safe fetch.
  if (fetchState === "loading") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (fetchState === "not_found" || fetchState === "forbidden") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="max-w-md rounded-xl border border-border bg-card p-8 text-center">
          <Lock className="mx-auto mb-3 h-7 w-7 text-muted-foreground" />
          <h2 className="font-display text-xl font-medium">Not found or not accessible</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            This report doesn't exist, has been removed, or you don't have permission to open it.
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <Button variant="outline" onClick={() => navigate("/dashboard")}>My Analyses</Button>
            <Button onClick={() => navigate("/analyze")}>New analysis</Button>
          </div>
        </div>
      </div>
    );
  }

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

  /** Best-effort fetch of the version family. Never blocks export. */
  const fetchVersionFamilySafe = async (): Promise<VersionFamilyEntry[] | undefined> => {
    if (!reportId) return undefined;
    try {
      const family = await listReportVersions(reportId);
      if (!Array.isArray(family)) return undefined;
      return family.map((v: { id: string; slug?: string | null; title?: string | null; created_at: string }) => ({
        id: v.id,
        slug: v.slug,
        title: v.title,
        created_at: v.created_at,
        isCurrent: v.id === reportId,
      }));
    } catch (e) {
      console.warn("[results] versionFamily fetch failed (non-fatal):", e);
      return undefined;
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    const toastId = toast.loading("Generating PDF report…");
    try {
      const versionFamily = await fetchVersionFamilySafe();
      const result = await exportReportToPdf(
        captureRootRef.current,
        `${report.reportId}_${(inputs.projectName || "report").replace(/\s+/g, "_")}.pdf`,
        { report, inputs, versionFamily },
      );
      toast.success(`PDF downloaded: ${result.fileName}`, { id: toastId });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "PDF export failed.";
      toast.error(msg, { id: toastId });
    } finally {
      setDownloading(false);
    }
  };

  const handleExportPptx = async () => {
    setDownloading(true);
    const id = toast.loading("Generating PowerPoint deck…");
    try {
      const baseName = `${report.reportId}_${(inputs.projectName || "report").replace(/\s+/g, "_")}`;
      await exportReportToPptx(report, inputs, `${baseName}.pptx`);
      toast.success("Deck downloaded", { id });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "PPTX export failed", { id });
    } finally { setDownloading(false); }
  };

  const handleExportXlsx = async () => {
    setDownloading(true);
    const id = toast.loading("Generating Excel workbook…");
    try {
      const baseName = `${report.reportId}_${(inputs.projectName || "report").replace(/\s+/g, "_")}`;
      await exportReportToXlsx(report, inputs, `${baseName}.xlsx`);
      toast.success("Workbook downloaded", { id });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "XLSX export failed", { id });
    } finally { setDownloading(false); }
  };

  const handleShare = async () => {
    let slug = shareSlug;
    if (!slug) {
      setSavingShare(true);
      try { const d = await saveReport(inputs, report); slug = d.slug; setShareSlug(slug); setReportId(d.id); }
      catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Share failed"); setSavingShare(false); return; }
      setSavingShare(false);
    }
    const url = `${window.location.origin}/r/${slug}`;
    try { await navigator.clipboard.writeText(url); setCopied(true); toast.success("Share link copied"); setTimeout(() => setCopied(false), 2000); }
    catch { toast.info(url); }
  };

  const handleRestore = async () => {
    if (!reportId) return;
    setRestoring(true);
    try {
      await restoreReportGroup(reportId);
      setArchivedAt(null);
      toast.success("Project restored");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div>
      {archivedAt && canEdit && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 no-print">
          <div className="flex items-center gap-2 text-sm">
            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-amber-600 ring-1 ring-inset ring-amber-500/40">
              Archived
            </span>
            <span className="text-amber-700 dark:text-amber-300">
              This project is archived. It stays in your library and remains shareable, but is hidden from the Active view.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/dashboard?scope=archived")} className="h-8">
              Back to Archived
            </Button>
            <Button size="sm" onClick={handleRestore} disabled={restoring} className="h-8 gap-1.5">
              {restoring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Restore project
            </Button>
          </div>
        </div>
      )}
      {/* In-page action row — replaces the previous sticky page-level nav.
          AppShell already provides the topbar; this row holds report-scoped actions. */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 no-print">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-primary ring-1 ring-inset ring-primary/30">
            Dashboard
          </span>
          <span className="text-xs text-muted-foreground">Interactive analysis</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("/analyze")} className="h-8 gap-1.5">
            <ArrowLeft className="h-3.5 w-3.5" /> New
          </Button>
          <Button variant="outline" size="sm" onClick={handleShare} disabled={savingShare} className="h-8 gap-1.5">
            {savingShare ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : copied ? <Check className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Share"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" disabled={downloading} className="h-8 gap-1.5">
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
        </div>
      </div>

      {/* ============== INTERACTIVE DASHBOARD ============== */}
      <section className="no-print">
        <InteractiveDashboard report={report} inputs={inputs} />

        {/* Evidence layer */}
        <div className="mt-8 space-y-4">
          <div>
            <h2 className="font-display text-lg font-semibold tracking-tight">Why this score?</h2>
            <p className="text-xs text-muted-foreground">Per-dimension drivers, input quality, and evidence breakdown.</p>
          </div>
          <EvidenceSections report={report} reportId={reportId || undefined} canEdit={canEdit} />
        </div>

        {/* ============== EXPORT CTA ============== */}
        <div className="mt-10 rounded-xl border border-border bg-card/60 p-6 backdrop-blur">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-display text-lg font-semibold tracking-tight">Export your report</h3>
              <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
                The dashboard is interactive. The PDF is generated separately as a native, selectable
                decision report — searchable text, real tables, and clean typography.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleDownload} disabled={downloading} className="gap-2">
                {downloading
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating PDF…</>
                  : <><FileText className="h-4 w-4" /> Download PDF</>}
              </Button>
              <Button variant="outline" onClick={handleExportXlsx} disabled={downloading} className="gap-2">
                <FileSpreadsheet className="h-4 w-4" /> Excel
              </Button>
              <Button variant="outline" onClick={handleExportPptx} disabled={downloading} className="gap-2">
                <Presentation className="h-4 w-4" /> PowerPoint
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ============== OFFSCREEN CHART CAPTURE ROOT ==============
          Hidden from users; rendered solely so the PDF exporter can capture
          chart images via [data-pdf-chart="..."]. Not interactive. */}
      <div
        ref={captureRootRef}
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "-10000px",
          top: 0,
          width: "794px",
          pointerEvents: "none",
          background: "#ffffff",
        }}
      >
        <div data-pdf-chart="fmart-radar" style={{ width: 720, padding: 16, background: "#ffffff" }}>
          <FMARTRadar scores={report.scores} />
        </div>
        <div data-pdf-chart="market-growth" style={{ width: 720, padding: 16, background: "#ffffff" }}>
          <MarketGrowthChart data={report.market.growthChart} currency={report.market.currency} />
        </div>
        <div data-pdf-chart="capex-breakdown" style={{ width: 720, padding: 16, background: "#ffffff" }}>
          <CapExBarChart data={report.financials.capEx} currency={report.financials.currency} />
        </div>
      </div>
    </div>
  );
};

export default Results;
