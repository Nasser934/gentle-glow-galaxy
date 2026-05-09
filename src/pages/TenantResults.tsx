import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Check, ExternalLink, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InteractiveDashboard } from "@/components/report/InteractiveDashboard";
import { useTenant } from "@/contexts/TenantContext";
import type { ConceptInputs, FeasibilityReport } from "@/types/analysis";
import { toast } from "sonner";

export default function TenantResults() {
  const location = useLocation();
  const navigate = useNavigate();
  const { tenant } = useTenant();
  const [copied, setCopied] = useState(false);

  const report = location.state?.report as FeasibilityReport | undefined;
  const inputs = location.state?.inputs as ConceptInputs | undefined;
  const reportRow = location.state?.reportRow as { id: string; slug: string; title?: string; created_at?: string } | undefined;

  const projectName = useMemo(() => inputs?.projectName || reportRow?.title || "Untitled analysis", [inputs?.projectName, reportRow?.title]);

  if (!report || !inputs || !reportRow?.id || !reportRow?.slug) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center bg-background">
        <div className="text-center">
          <h2 className="font-display text-2xl font-bold text-foreground">No Saved Analysis Result</h2>
          <p className="mt-2 max-w-md text-muted-foreground">
            The analysis result was not saved by the server. Please run the analysis again from this workspace.
          </p>
          <Button onClick={() => navigate(`/t/${tenant.slug}/analyze`)} className="mt-6">Start New Analysis</Button>
        </div>
      </div>
    );
  }

  const shareUrl = `${window.location.origin}/r/${reportRow.slug}`;

  const copyShareLink = async () => {
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
            Saved under {tenant.name} by the server
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link to={`/t/${tenant.slug}/reports/${reportRow.id}`}>
              <ExternalLink className="mr-2 h-4 w-4" /> Open workspace report
            </Link>
          </Button>
          <Button variant="outline" onClick={copyShareLink}>
            {copied ? <Check className="mr-2 h-4 w-4" /> : <Share2 className="mr-2 h-4 w-4" />}
            {copied ? "Copied" : "Share"}
          </Button>
        </div>
      </div>

      <InteractiveDashboard report={report} inputs={inputs} />
    </div>
  );
}
