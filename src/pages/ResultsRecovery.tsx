import { useMemo, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, BarChart3, Download, Save, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UserMenu } from "@/components/UserMenu";
import { FeasibilityStudyDashboard } from "@/components/report/FeasibilityStudyDashboard";
import { generateLocalReport } from "@/lib/localReport";
import { validateTemplateIntegrity } from "@/lib/reportTemplates";
import { consumerSafeEvidenceNote, sanitizeConsumerObject, sanitizeConsumerText } from "@/lib/consumerSafety";
import { effectiveAnalysisConfidence, normalizeReportForDisplay, presentationReportLabel } from "@/lib/reportPresentation";
import { publishReport, saveReport, unpublishReport } from "@/lib/reports";
import { toast } from "sonner";
import type { ConceptInputs, FeasibilityReport } from "@/types/analysis";

type State = { report?: Partial<FeasibilityReport>; inputs?: ConceptInputs; reportId?: string; slug?: string; isPublic?: boolean };

const isText = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const hasTextArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === "string");

const valid = (r?: Partial<FeasibilityReport>): r is FeasibilityReport => {
  if (!r) return false;
  if (!isText(r.reportId) || !isText(r.executiveSummary)) return false;
  if (!r.scores || !isNumber(r.scores.overall) || !isNumber(r.scores.financial) || !isNumber(r.scores.market) || !isNumber(r.scores.achievability) || !isNumber(r.scores.risk) || !isNumber(r.scores.timing) || !isNumber(r.scores.operational)) return false;
  if (!r.market || !isText(r.market.tamValue) || !isText(r.market.tamCagr) || !isText(r.market.tamLabel) || !isText(r.market.samValue) || !isText(r.market.samCagr) || !isText(r.market.samLabel) || !isText(r.market.somValue) || !isText(r.market.somCagr) || !isText(r.market.somLabel)) return false;
  if (!r.customer || !isText(r.customer.ageLocation) || !isText(r.customer.goals) || !isText(r.customer.willingnessToPay) || !isText(r.customer.behavior)) return false;
  if (!r.financials || !isText(r.financials.currency) || !r.financials.capExTotal || !isNumber(r.financials.capExTotal.mid) || !Array.isArray(r.financials.scenarios)) return false;
  if (!Array.isArray(r.risks) || !Array.isArray(r.competitors) || !Array.isArray(r.fundingMix)) return false;
  if (!hasTextArray(r.recommendations) || !hasTextArray(r.nextSteps)) return false;
  return true;
};

export default function ResultsRecovery() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = (location.state ?? {}) as State;
  const inputs = state.inputs;
  const report = useMemo(() => {
    if (!inputs) return null;
    const generated = valid(state.report) ? state.report : generateLocalReport(inputs);
    return normalizeReportForDisplay(sanitizeConsumerObject(generated));
  }, [inputs, state.report]);
  const [savedId, setSavedId] = useState(state.reportId ?? "");
  const [slug, setSlug] = useState(state.slug ?? "");
  const [isPublic, setIsPublic] = useState(Boolean(state.isPublic));
  const [busy, setBusy] = useState(false);

  if (!inputs || !report) return <Navigate to="/analyze" replace />;

  const validation = validateTemplateIntegrity(inputs, report);
  const confidence = effectiveAnalysisConfidence(report);
  const evidenceNote = consumerSafeEvidenceNote(report.research?.citations?.length ?? 0, confidence.label);

  const exportPdf = async () => {
    try {
      const { exportBRDReportPdf } = await import("@/lib/exportPdfBRD");
      await exportBRDReportPdf(`${report.reportId}.pdf`, { report, inputs });
    } catch (error) {
      console.error("PDF export failed", error);
      toast.error("PDF export could not be completed. Please try again.");
    }
  };

  const saveCurrentReport = async () => {
    setBusy(true);
    try {
      const saved = await saveReport(inputs, report);
      setSavedId(saved.id);
      setSlug(saved.slug);
      setIsPublic(saved.is_public);
      toast.success("Report saved privately.");
    } catch (error) {
      console.error(error);
      toast.error("Could not save the report. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const toggleShare = async () => {
    if (!savedId) {
      await saveCurrentReport();
      return;
    }
    setBusy(true);
    try {
      const updated = isPublic ? await unpublishReport(savedId) : await publishReport(savedId);
      setIsPublic(updated.is_public);
      setSlug(updated.slug);
      if (updated.is_public) {
        const url = `${window.location.origin}/r/${updated.slug}`;
        await navigator.clipboard.writeText(url);
        toast.success("Public link copied.");
      } else {
        toast.success("Report is private again.");
      }
    } catch (error) {
      console.error(error);
      toast.error("Could not update sharing. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return <div className="min-h-screen bg-background text-foreground">
    <nav className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto flex h-14 items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2.5"><span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15"><BarChart3 className="h-4 w-4 text-primary" /></span><span className="font-medium">Concept AI</span></Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button variant="outline" size="sm" onClick={() => navigate("/analyze")} className="gap-1"><ArrowLeft className="h-4 w-4" />New</Button>
          <Button variant="outline" size="sm" onClick={saveCurrentReport} disabled={busy || Boolean(savedId)} className="gap-1"><Save className="h-4 w-4" />{savedId ? "Saved" : "Save"}</Button>
          <Button variant="outline" size="sm" onClick={toggleShare} disabled={busy} className="gap-1"><Share2 className="h-4 w-4" />{isPublic ? "Unshare" : "Share"}</Button>
          <Button size="sm" onClick={exportPdf} className="gap-1"><Download className="h-4 w-4" />Export PDF</Button>
          <UserMenu />
        </div>
      </div>
    </nav>
    <main id="main-content" className="container mx-auto max-w-7xl px-6 py-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge variant="outline">{sanitizeConsumerText(presentationReportLabel(inputs, report))}</Badge>
          <Badge className="bg-primary text-primary-foreground">{sanitizeConsumerText(validation.recommendation)}</Badge>
          {isPublic && slug && <Badge variant="outline">Shared</Badge>}
        </div>
        <p className="max-w-2xl text-right text-xs text-muted-foreground">{evidenceNote}</p>
      </div>
      <FeasibilityStudyDashboard report={report} inputs={inputs} />
    </main>
  </div>;
}
