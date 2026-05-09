import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ExternalLink, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listMyReports, listTenantReports, deleteReport } from "@/lib/reports";
import { useOptionalTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";

const statusColor: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  in_review: "bg-amber-500/15 text-amber-600",
  approved: "bg-emerald-500/15 text-emerald-600",
  rejected: "bg-rose-500/15 text-rose-600",
};

const Dashboard = () => {
  const navigate = useNavigate();
  const tenantCtx = useOptionalTenant();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const tenant = tenantCtx?.tenant;

  const workspacePath = (path: string) => tenant ? `/t/${tenant.slug}/${path}` : `/${path}`;

  const load = () => {
    setLoading(true);
    const loader = tenant ? listTenantReports(tenant.id) : listMyReports();
    loader.then(setRows).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
  };

  useEffect(load, [tenant?.id]);

  const onDelete = async (id: string) => {
    if (!confirm("Delete this analysis? This cannot be undone.")) return;
    try {
      await deleteReport(id);
      toast.success("Deleted");
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="container mx-auto px-6 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-medium tracking-tight">
            {tenant ? `${tenant.name} Analyses` : "My Analyses"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Saved feasibility reports for this workspace.
          </p>
        </div>
        <Button onClick={() => navigate(workspacePath("analyze"))} className="gap-2">
          <Plus className="h-4 w-4" /> New analysis
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/30 py-20 text-center">
          <p className="text-muted-foreground">No analyses yet.</p>
          <Button onClick={() => navigate(workspacePath("analyze"))} className="mt-4 gap-2">
            <Plus className="h-4 w-4" /> Run your first
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/60">
          <table className="w-full text-sm">
            <thead className="bg-card/50 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Project</th>
                <th className="px-4 py-3 text-left">Industry</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-card/40">
                  <td className="px-4 py-3">
                    <Link
                      to={tenant ? `/t/${tenant.slug}/reports/${r.id}` : `/r/${r.slug}`}
                      className="font-medium hover:text-primary"
                    >
                      {r.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.industry || "—"}</td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary" className={statusColor[r.status]}>
                      {r.status.replace("_", " ")}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" asChild>
                        <Link to={`/r/${r.slug}`}><ExternalLink className="h-4 w-4" /></Link>
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => onDelete(r.id)}>
                        <Trash2 className="h-4 w-4 text-rose-500" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
