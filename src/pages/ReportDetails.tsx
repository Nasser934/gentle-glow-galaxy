import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ExternalLink, Loader2, Lock, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CommentsPanel } from "@/components/report/CommentsPanel";
import { InteractiveDashboard } from "@/components/report/InteractiveDashboard";
import { StatusControl } from "@/components/report/StatusControl";
import { useTenant } from "@/contexts/TenantContext";
import { getTenantReportById, type ReportRow } from "@/lib/reports";
import { toast } from "sonner";

export default function ReportDetails() {
  const { reportId = "" } = useParams();
  const navigate = useNavigate();
  const { tenant, canWrite } = useTenant();
  const [row, setRow] = useState<ReportRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getTenantReportById(tenant.id, reportId)
      .then(setRow)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [reportId, tenant.id]);

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!row) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center bg-background text-center">
        <div>
          <Lock className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <h2 className="font-display text-xl font-medium">Report not found</h2>
          <p className="mt-1 text-sm text-muted-foreground">It may have been deleted or you may not have access.</p>
          <Button onClick={() => navigate(`/t/${tenant.slug}/dashboard`)} className="mt-4">Back to dashboard</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-primary">Workspace report</div>
          <h1 className="mt-1 font-display text-2xl font-medium tracking-tight">{row.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {row.industry || "No industry"} · saved {new Date(row.created_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canWrite && <StatusControl report={row} onChanged={(s) => setRow({ ...row, status: s })} />}
          <Button variant="outline" asChild>
            <Link to={`/r/${row.slug}`}>
              <ExternalLink className="mr-2 h-4 w-4" /> Public view
            </Link>
          </Button>
        </div>
      </div>

      <InteractiveDashboard report={row.output} inputs={row.inputs} />

      <div className="mt-10 border-t border-border pt-6">
        <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-medium tracking-tight">
          <MessageSquare className="h-4 w-4" /> Discussion
        </h2>
        <CommentsPanel reportId={row.id} />
      </div>
    </div>
  );
}
