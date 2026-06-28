import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Plus,
  ExternalLink,
  Trash2,
  Loader2,
  Gauge,
  Sparkles,
  FolderOpen,
  CheckCircle2,
  ClipboardList,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listMyReports, deleteReport } from "@/lib/reports";
import { toast } from "sonner";

const statusStyle: Record<string, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  in_review: "bg-warning/10 text-warning border-warning/30",
  approved: "bg-success/10 text-success border-success/30",
  rejected: "bg-destructive/10 text-destructive border-destructive/30",
};

type StatusKey = "all" | "draft" | "in_review" | "approved" | "rejected";

const Dashboard = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusKey>("all");

  const load = () => {
    setLoading(true);
    listMyReports()
      .then(setRows)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (!q) return true;
      return (r.title || "").toLowerCase().includes(q) || (r.industry || "").toLowerCase().includes(q);
    });
  }, [rows, query, status]);

  const stats = useMemo(() => {
    return {
      total: rows.length,
      approved: rows.filter((r) => r.status === "approved").length,
      inReview: rows.filter((r) => r.status === "in_review").length,
      drafts: rows.filter((r) => r.status === "draft").length,
    };
  }, [rows]);

  const statusFilters: { key: StatusKey; label: string }[] = [
    { key: "all", label: "All status" },
    { key: "approved", label: "Approved" },
    { key: "in_review", label: "In review" },
    { key: "draft", label: "Draft" },
    { key: "rejected", label: "Rejected" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">My Analyses</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Track, compare, and resume your feasibility analyses.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/decision-room/demo")}
            className="h-9 gap-2"
          >
            <Sparkles className="h-4 w-4" strokeWidth={1.75} /> Load Demo Case
          </Button>
          <Button onClick={() => navigate("/analyze")} size="sm" className="h-9 gap-2">
            <Plus className="h-4 w-4" strokeWidth={2} /> New Analysis
          </Button>
        </div>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total analyses" value={stats.total} icon={FolderOpen} />
        <StatCard label="Approved" value={stats.approved} icon={CheckCircle2} tone="success" />
        <StatCard label="In review" value={stats.inReview} icon={ClipboardList} tone="warning" />
        <StatCard label="Drafts" value={stats.drafts} icon={Gauge} />
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search analyses…"
            className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-3 text-[13px] focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {statusFilters.map((f) => {
            const active = status === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setStatus(f.key)}
                className={`h-8 rounded-md border px-2.5 text-[12px] font-medium transition-colors ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card py-20 text-center">
          <p className="text-muted-foreground">
            {rows.length === 0 ? "No analyses yet." : "No analyses match these filters."}
          </p>
          {rows.length === 0 && (
            <Button onClick={() => navigate("/analyze")} className="mt-4 gap-2">
              <Plus className="h-4 w-4" /> Run your first
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm tabular-nums">
            <thead className="border-b border-border bg-background/50 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="px-4 py-3 text-left font-medium">Industry</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Updated</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-background/60">
                  <td className="px-4 py-3">
                    <Link to={`/reports/${r.id}`} className="font-medium hover:text-primary">
                      {r.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.industry || "—"}</td>
                  <td className="px-4 py-3">
                    <Badge
                      variant="outline"
                      className={`border ${statusStyle[r.status] || statusStyle.draft}`}
                    >
                      {(r.status || "draft").replace("_", " ")}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" asChild title="Open Decision Room">
                        <Link to={`/decision-room/${r.id}`}>
                          <Gauge className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button size="sm" variant="ghost" asChild title="Open full report">
                        <Link to={`/r/${r.slug}`}>
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onDelete(r.id)}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
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

const StatCard = ({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof FolderOpen;
  tone?: "success" | "warning";
}) => {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "warning"
      ? "text-warning"
      : "text-primary";
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <span>{label}</span>
        <Icon className={`h-3.5 w-3.5 ${toneClass}`} strokeWidth={1.75} />
      </div>
      <div className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
    </div>
  );
};

export default Dashboard;
