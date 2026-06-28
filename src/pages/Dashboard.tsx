import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Plus,
  ExternalLink,
  
  Gauge,
  Sparkles,
  FolderOpen,
  CheckCircle2,
  ClipboardList,
  Search,
  ChevronRight,
  ChevronDown,
  MoreHorizontal,
  Archive,
  ArchiveRestore,
  GitCompare,
  Link2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  listMyReports,
  archiveReportGroup,
  restoreReportGroup,
  updateReportStatus,
  type ReportScope,
  type ReportRow,
} from "@/lib/reports";
import { toast } from "sonner";

const statusStyle: Record<string, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  in_review: "bg-warning/10 text-warning border-warning/30",
  approved: "bg-success/10 text-success border-success/30",
  rejected: "bg-destructive/10 text-destructive border-destructive/30",
};

type StatusKey = "all" | "draft" | "in_review" | "approved" | "rejected";

type Row = {
  id: string;
  slug: string;
  title: string;
  industry: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  parent_report_id: string | null;
  archived_at: string | null;
};

type Group = {
  rootId: string;
  latest: Row;
  versions: Row[]; // newest first
  lastActivity: number;
};

function groupRows(rows: Row[]): Group[] {
  const buckets = new Map<string, Row[]>();
  for (const r of rows) {
    const key = r.parent_report_id ?? r.id;
    const arr = buckets.get(key) ?? [];
    arr.push(r);
    buckets.set(key, arr);
  }
  const groups: Group[] = [];
  for (const [rootId, arr] of buckets) {
    const sorted = [...arr].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    const lastActivity = Math.max(
      ...sorted.map((r) => new Date(r.updated_at || r.created_at).getTime()),
    );
    groups.push({ rootId, latest: sorted[0], versions: sorted, lastActivity });
  }
  groups.sort((a, b) => b.lastActivity - a.lastActivity);
  return groups;
}

function relativeTime(iso: string) {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const day = 86400000;
  if (diff < day) {
    const h = Math.max(1, Math.floor(diff / 3600000));
    return `${h}h ago`;
  }
  const days = Math.floor(diff / day);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

const Dashboard = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusKey>("all");
  const [searchParams] = useSearchParams();
  const initialScope: ReportScope = (() => {
    const s = searchParams.get("scope");
    return s === "archived" || s === "all" ? s : "active";
  })();
  const [scope, setScope] = useState<ReportScope>(initialScope);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pendingArchive, setPendingArchive] = useState<Group | null>(null);

  const load = (s: ReportScope = scope) => {
    setLoading(true);
    listMyReports(s)
      .then((d) => setRows(d as Row[]))
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load(scope);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  const groups = useMemo(() => groupRows(rows), [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups.filter((g) => {
      if (status !== "all" && g.latest.status !== status) return false;
      if (!q) return true;
      return g.versions.some(
        (v) =>
          (v.title || "").toLowerCase().includes(q) ||
          (v.industry || "").toLowerCase().includes(q),
      );
    });
  }, [groups, query, status]);

  const stats = useMemo(() => {
    return {
      total: groups.length,
      approved: groups.filter((g) => g.latest.status === "approved").length,
      inReview: groups.filter((g) => g.latest.status === "in_review").length,
      drafts: groups.filter((g) => g.latest.status === "draft").length,
    };
  }, [groups]);

  const statusFilters: { key: StatusKey; label: string }[] = [
    { key: "all", label: "All status" },
    { key: "approved", label: "Approved" },
    { key: "in_review", label: "In review" },
    { key: "draft", label: "Draft" },
    { key: "rejected", label: "Rejected" },
  ];

  const scopeFilters: { key: ReportScope; label: string }[] = [
    { key: "active", label: "Active" },
    { key: "archived", label: "Archived" },
    { key: "all", label: "All" },
  ];

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onArchive = async (g: Group) => {
    try {
      await archiveReportGroup(g.rootId);
      toast.success(`Archived ${g.versions.length} version${g.versions.length > 1 ? "s" : ""}`);
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setPendingArchive(null);
    }
  };

  const onRestore = async (g: Group) => {
    try {
      await restoreReportGroup(g.rootId);
      toast.success("Restored");
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const onChangeStatus = async (rowId: string, s: ReportRow["status"]) => {
    try {
      await updateReportStatus(rowId, s);
      // Optimistic local update so the chip refreshes immediately.
      setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, status: s } : r)));
      toast.success(`Status updated: ${s.replace("_", " ")}`);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const copyShare = (slug: string) => {
    const url = `${window.location.origin}/r/${slug}`;
    navigator.clipboard.writeText(url).then(
      () => toast.success("Share link copied"),
      () => toast.error("Could not copy link"),
    );
  };

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
        <StatCard label="Projects" value={stats.total} icon={FolderOpen} />
        <StatCard label="Approved" value={stats.approved} icon={CheckCircle2} tone="success" />
        <StatCard label="In review" value={stats.inReview} icon={ClipboardList} tone="warning" />
        <StatCard label="Drafts" value={stats.drafts} icon={Gauge} />
      </div>

      {/* Scope tabs */}
      <div className="flex gap-1 rounded-lg border border-border bg-card p-1">
        {scopeFilters.map((s) => {
          const active = scope === s.key;
          return (
            <button
              key={s.key}
              onClick={() => setScope(s.key)}
              className={`h-8 flex-1 rounded-md px-3 text-[12px] font-medium transition-colors ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2">
        <div className="relative min-w-[200px] flex-1">
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

      {/* Body */}
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          scope={scope}
          hasRows={rows.length > 0}
          onClearFilters={() => {
            setQuery("");
            setStatus("all");
          }}
          onNew={() => navigate("/analyze")}
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-xl border border-border bg-card md:block">
            <table className="w-full text-sm tabular-nums">
              <thead className="border-b border-border bg-background/50 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="w-8 px-2 py-3" />
                  <th className="px-4 py-3 text-left font-medium">Name</th>
                  <th className="px-4 py-3 text-left font-medium">Industry</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Versions</th>
                  <th className="px-4 py-3 text-left font-medium">Updated</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((g) => {
                  const isExp = expanded.has(g.rootId);
                  const hasMulti = g.versions.length > 1;
                  return (
                    <DesktopGroup
                      key={g.rootId}
                      group={g}
                      expanded={isExp}
                      onToggle={() => hasMulti && toggleExpand(g.rootId)}
                      scope={scope}
                      onArchive={() => setPendingArchive(g)}
                      onRestore={() => onRestore(g)}
                      onCopyShare={() => copyShare(g.latest.slug)}
                      onChangeStatus={(s) => onChangeStatus(g.latest.id, s)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {filtered.map((g) => (
              <MobileCard
                key={g.rootId}
                group={g}
                expanded={expanded.has(g.rootId)}
                onToggle={() => toggleExpand(g.rootId)}
                scope={scope}
                onArchive={() => setPendingArchive(g)}
                onRestore={() => onRestore(g)}
                onCopyShare={() => copyShare(g.latest.slug)}
                onChangeStatus={(s) => onChangeStatus(g.latest.id, s)}
              />
            ))}
          </div>
        </>
      )}

      {/* Archive confirm */}
      <AlertDialog open={!!pendingArchive} onOpenChange={(o) => !o && setPendingArchive(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this project?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingArchive
                ? `“${pendingArchive.latest.title}” and ${pendingArchive.versions.length} version${pendingArchive.versions.length > 1 ? "s" : ""} will be moved to Archived. You can restore them anytime.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => pendingArchive && onArchive(pendingArchive)}>
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

/* -------------------- Row actions menu -------------------- */

function RowActions({
  group,
  scope,
  onArchive,
  onRestore,
  onCopyShare,
}: {
  group: Group;
  scope: ReportScope;
  onArchive: () => void;
  onRestore: () => void;
  onCopyShare: () => void;
}) {
  const isArchived = !!group.latest.archived_at;
  const hasMulti = group.versions.length > 1;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="ghost" aria-label="More actions">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem asChild>
          <Link to={`/reports/${group.latest.id}`}>
            <ExternalLink className="mr-2 h-4 w-4" /> Open workspace
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to={`/decision-room/${group.latest.id}`}>
            <Gauge className="mr-2 h-4 w-4" /> Decision Room
          </Link>
        </DropdownMenuItem>
        {hasMulti && (
          <DropdownMenuItem asChild>
            <Link
              to={`/compare?ids=${group.versions[1].id},${group.versions[0].id}`}
            >
              <GitCompare className="mr-2 h-4 w-4" /> Compare versions
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={onCopyShare}>
          <Link2 className="mr-2 h-4 w-4" /> Copy share link
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {isArchived || scope === "archived" ? (
          <DropdownMenuItem onClick={onRestore}>
            <ArchiveRestore className="mr-2 h-4 w-4" /> Restore project
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={onArchive} className="text-destructive focus:text-destructive">
            <Archive className="mr-2 h-4 w-4" /> Archive project
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* -------------------- Desktop row -------------------- */

function DesktopGroup({
  group,
  expanded,
  onToggle,
  scope,
  onArchive,
  onRestore,
  onCopyShare,
}: {
  group: Group;
  expanded: boolean;
  onToggle: () => void;
  scope: ReportScope;
  onArchive: () => void;
  onRestore: () => void;
  onCopyShare: () => void;
}) {
  const hasMulti = group.versions.length > 1;
  const versionLabel = hasMulti ? `v${group.versions.length} · ${group.versions.length} versions` : "v1";
  return (
    <>
      <tr className="hover:bg-background/60">
        <td className="px-2 py-3 text-center">
          {hasMulti ? (
            <button onClick={onToggle} aria-label={expanded ? "Collapse versions" : "Expand versions"} className="text-muted-foreground hover:text-foreground">
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ) : null}
        </td>
        <td className="px-4 py-3">
          <Link to={`/reports/${group.latest.id}`} className="font-medium hover:text-primary">
            {group.latest.title}
          </Link>
          {group.latest.archived_at && (
            <Badge variant="outline" className="ml-2 border-muted-foreground/30 text-[10px] text-muted-foreground">
              Archived
            </Badge>
          )}
        </td>
        <td className="px-4 py-3 text-muted-foreground">{group.latest.industry || "—"}</td>
        <td className="px-4 py-3">
          <Badge variant="outline" className={`border ${statusStyle[group.latest.status] || statusStyle.draft}`}>
            {(group.latest.status || "draft").replace("_", " ")}
          </Badge>
        </td>
        <td className="px-4 py-3 text-muted-foreground">{versionLabel}</td>
        <td className="px-4 py-3 text-muted-foreground">{relativeTime(group.latest.updated_at || group.latest.created_at)}</td>
        <td className="px-4 py-3">
          <div className="flex justify-end">
            <RowActions group={group} scope={scope} onArchive={onArchive} onRestore={onRestore} onCopyShare={onCopyShare} />
          </div>
        </td>
      </tr>
      {expanded &&
        group.versions.map((v, idx) => (
          <tr key={v.id} className="bg-background/30 text-[12px]">
            <td />
            <td className="px-4 py-2 pl-8 text-muted-foreground">
              <span className="font-medium text-foreground">v{group.versions.length - idx}</span>
              {idx === 0 && <span className="ml-2 text-[11px] text-primary">current</span>}
              {idx === group.versions.length - 1 && idx !== 0 && <span className="ml-2 text-[11px]">original</span>}
            </td>
            <td className="px-4 py-2 text-muted-foreground">{v.industry || "—"}</td>
            <td className="px-4 py-2">
              <Badge variant="outline" className={`border ${statusStyle[v.status] || statusStyle.draft}`}>
                {(v.status || "draft").replace("_", " ")}
              </Badge>
            </td>
            <td />
            <td className="px-4 py-2 text-muted-foreground">{relativeTime(v.created_at)}</td>
            <td className="px-4 py-2">
              <div className="flex justify-end gap-1">
                <Button size="sm" variant="ghost" asChild>
                  <Link to={`/reports/${v.id}`}>Open</Link>
                </Button>
              </div>
            </td>
          </tr>
        ))}
    </>
  );
}

/* -------------------- Mobile card -------------------- */

function MobileCard({
  group,
  expanded,
  onToggle,
  scope,
  onArchive,
  onRestore,
  onCopyShare,
}: {
  group: Group;
  expanded: boolean;
  onToggle: () => void;
  scope: ReportScope;
  onArchive: () => void;
  onRestore: () => void;
  onCopyShare: () => void;
}) {
  const hasMulti = group.versions.length > 1;
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <Link to={`/reports/${group.latest.id}`} className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-medium">{group.latest.title}</div>
          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {(group.latest.industry || "—")} · {hasMulti ? `v${group.versions.length} · ${group.versions.length} versions` : "v1"}
          </div>
        </Link>
        <RowActions group={group} scope={scope} onArchive={onArchive} onRestore={onRestore} onCopyShare={onCopyShare} />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`border ${statusStyle[group.latest.status] || statusStyle.draft}`}>
            {(group.latest.status || "draft").replace("_", " ")}
          </Badge>
          {group.latest.archived_at && (
            <Badge variant="outline" className="border-muted-foreground/30 text-[10px] text-muted-foreground">
              Archived
            </Badge>
          )}
        </div>
        <span className="text-[11px] text-muted-foreground">
          {relativeTime(group.latest.updated_at || group.latest.created_at)}
        </span>
      </div>
      {hasMulti && (
        <>
          <button
            onClick={onToggle}
            className="mt-2 flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-border py-1.5 text-[11px] text-muted-foreground hover:text-foreground"
          >
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {expanded ? "Hide versions" : `Show ${group.versions.length - 1} older version${group.versions.length > 2 ? "s" : ""}`}
          </button>
          {expanded && (
            <ul className="mt-2 space-y-1">
              {group.versions.slice(1).map((v, i) => (
                <li
                  key={v.id}
                  className="flex items-center justify-between rounded-md bg-background/50 px-2 py-1.5 text-[12px]"
                >
                  <span className="text-muted-foreground">
                    v{group.versions.length - 1 - i} · {relativeTime(v.created_at)}
                  </span>
                  <Link to={`/reports/${v.id}`} className="text-primary">
                    Open
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/* -------------------- Bits -------------------- */

function EmptyState({
  scope,
  hasRows,
  onClearFilters,
  onNew,
}: {
  scope: ReportScope;
  hasRows: boolean;
  onClearFilters: () => void;
  onNew: () => void;
}) {
  if (scope === "archived" && !hasRows) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card py-16 text-center">
        <p className="text-muted-foreground">No archived analyses.</p>
      </div>
    );
  }
  if (!hasRows) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card py-20 text-center">
        <p className="text-muted-foreground">No analyses yet.</p>
        <Button onClick={onNew} className="mt-4 gap-2">
          <Plus className="h-4 w-4" /> Run your first
        </Button>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-dashed border-border bg-card py-16 text-center">
      <p className="text-muted-foreground">No analyses match these filters.</p>
      <Button variant="outline" size="sm" onClick={onClearFilters} className="mt-3">
        Clear filters
      </Button>
    </div>
  );
}

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
    tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-primary";
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


