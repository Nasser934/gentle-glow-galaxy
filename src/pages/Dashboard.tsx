import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BarChart3, Plus, ExternalLink, Trash2, Loader2, Lock, Globe2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UserMenu } from "@/components/UserMenu";
import { listMyReports, deleteReport } from "@/lib/reports";
import { toast } from "sonner";

const statusColor: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  in_review: "bg-amber-500/15 text-amber-600",
  approved: "bg-emerald-500/15 text-emerald-600",
  rejected: "bg-rose-500/15 text-rose-600",
};

type DashboardReport = Awaited<ReturnType<typeof listMyReports>>[number];

const messageFromError = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

const Dashboard = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<DashboardReport[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    listMyReports()
      .then((data) => setRows(data as DashboardReport[]))
      .catch((error: unknown) => toast.error(messageFromError(error, "Could not load reports.")))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const onDelete = async (id: string) => {
    if (!confirm("Delete this analysis? This cannot be undone.")) return;
    try {
      await deleteReport(id);
      toast.success("Deleted");
      load();
    } catch (error: unknown) {
      toast.error(messageFromError(error, "Could not delete report."));
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto flex h-14 items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15 ring-1 ring-inset ring-primary/30">
              <BarChart3 className="h-3.5 w-3.5 text-primary" />
            </div>
            <span className="text-[15px] font-medium tracking-tight">Concept AI</span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </nav>

      <div className="container mx-auto px-6 py-10">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-medium tracking-tight">My Analyses</h1>
            <p className="text-sm text-muted-foreground">All saved feasibility reports for your account.</p>
          </div>
          <Button onClick={() => navigate("/analyze")} className="gap-2"><Plus className="h-4 w-4" /> New analysis</Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/30 py-20 text-center">
            <p className="text-muted-foreground">No analyses yet.</p>
            <Button onClick={() => navigate("/analyze")} className="mt-4 gap-2"><Plus className="h-4 w-4" /> Run your first</Button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border/60">
            <table className="w-full text-sm">
              <thead className="bg-card/50 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Project</th>
                  <th className="px-4 py-3 text-left">Industry</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Sharing</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-card/40">
                    <td className="px-4 py-3">
                      <Link to={`/r/${r.slug}`} className="font-medium hover:text-primary">{r.title}</Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{r.industry || "—"}</td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary" className={statusColor[r.status]}>{r.status.replace("_", " ")}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {r.is_public ? (
                        <Badge variant="secondary" className="gap-1 bg-blue-500/15 text-blue-600"><Globe2 className="h-3 w-3" /> Shared</Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1 bg-muted text-muted-foreground"><Lock className="h-3 w-3" /> Private</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" asChild><Link to={`/r/${r.slug}`}><ExternalLink className="h-4 w-4" /></Link></Button>
                        <Button size="sm" variant="ghost" onClick={() => onDelete(r.id)}><Trash2 className="h-4 w-4 text-rose-500" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
