import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Check, ExternalLink, Loader2, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InteractiveDashboard } from "@/components/report/InteractiveDashboard";
import { useTenant } from "@/contexts/TenantContext";
import { saveReport } from "@/lib/reports";
import type { ConceptInputs, FeasibilityReport } from "@/types/analysis";
import { toast } from "sonner";

export default function TenantResults() {
  const location = useLocation();
  const navigate = useNavigate();
  const { tenant } = useTenant();
  const [saving, setSaving] = useState(false);
  const [shareSlug, setShareSlug] = useState<string | null>(location.state?.slug ?? null);
  const [reportId, setReportId] = useState<string | null>(location.state?.reportRow?.id ?? null);
  const [copied, setCopied] = useState(false);

  const report = location.state?.report as FeasibilityReport | undefined;
  const inputs = location.state?.inputs as ConceptInputs | undefined;

  const projectName = useMemo(() => inputs?.projectName || "Untitled analysis", [inputs?.projectName]);

  useEffect(() => {
    if (!report || !inputs || shareSlug || reportId) return;

    let cancelled = false;
    setSaving(true);
    saveReport(inputs, report, tenant.id)
      .then((row) => {
        if (cancelled) return;
        setShareSlug(row.slug);
        setReportId(row.id);
      })
      .catch((e) => {
        console.warn("tenant auto-save failed", e);
        toast.error(e?.message || "Could not save report to workspace.");
      })
      .finally(() => {
        if (!cancelled) setSaving(false);
      });

    return () => { cancelled = true; };
  }, [inputs, report, shareSlug, reportId, tenant.id]);

  if (!report || !inputs) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center bg-background">
        <div className="text-center">
          <h2 className="font-display text-2xl font-bold text-foreground">No Analysis Results</h2>
          <p className="mt-2 text-muted-foreground">Please run an analysis first.</p>
          <Button onClick={() => navigate(`/t/${tenant.slug}/analyze`)} className="mt-6">Start New Analysis</Button>
        </div>
      </div>
    );
  }

  const shareUrl = shareSlug ? `${window.location.origin}/r/${shareSlug}` : null;

  const copyShareLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Share link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.info(shareUrl);
    }
  };

  return (
    <div className="container mx-auto px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-primary">Workspace analysis</div>
          <h1 className="mt-1 font-display text-2xl font-medium tracking-tight">{projectName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Saved under {tenant.name}{saving ? " · saving…" : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {reportId && (
            <Button variant="outline" asChild>
              <Link to={`/t/${tenant.slug}/reports/${reportId}`}>
                <ExternalLink className="mr-2 h-4 w-4" /> Open workspace report
              </Link>
            </Button>
          )}
          <Button variant="outline" onClick={copyShareLink} disabled={!shareUrl || saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : copied ? <Check className="mr-2 h-4 w-4" /> : <Share2 className="mr-2 h-4 w-4" />}
            {copied ? "Copied" : "Share"}
          </Button>
        </div>
      </div>

      <InteractiveDashboard report={report} inputs={inputs} />
    </div>
  );
}
