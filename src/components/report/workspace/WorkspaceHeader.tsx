import { ReactNode, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronRight, GitBranch, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { listReportVersions } from "@/lib/reports";

type StatusValue = "draft" | "in_review" | "approved" | "rejected" | null | undefined;

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground ring-border",
  in_review: "bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-amber-500/30",
  approved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30",
  rejected: "bg-rose-500/15 text-rose-700 dark:text-rose-300 ring-rose-500/30",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  in_review: "In Review",
  approved: "Approved",
  rejected: "Rejected",
};

interface VersionRow {
  id: string;
  title?: string | null;
  created_at: string;
}

interface WorkspaceHeaderProps {
  title: string;
  status?: StatusValue;
  reportId?: string | null;
  /** Slot for the existing StatusControl + export/share buttons. */
  actions?: ReactNode;
  /** Preserve current query string, e.g. ?tab=versions, when switching versions. */
  versionSearch?: string;
}

/**
 * Owner workspace header — breadcrumb, title, status pill, and version switcher.
 * Purely presentational; status mutations stay in the caller (StatusControl).
 */
export const WorkspaceHeader = ({ title, status, reportId, actions, versionSearch = "" }: WorkspaceHeaderProps) => {
  const navigate = useNavigate();
  const [versions, setVersions] = useState<VersionRow[] | null>(null);
  const [loadingVersions, setLoadingVersions] = useState(false);

  useEffect(() => {
    if (!reportId) return;
    let cancelled = false;
    setLoadingVersions(true);
    listReportVersions(reportId)
      .then((rows) => {
        if (cancelled) return;
        setVersions(rows as VersionRow[]);
      })
      .catch(() => { /* non-fatal */ })
      .finally(() => { if (!cancelled) setLoadingVersions(false); });
    return () => { cancelled = true; };
  }, [reportId]);

  const currentIndex = versions?.findIndex((v) => v.id === reportId) ?? -1;
  const versionLabel =
    currentIndex >= 0 && versions && versions.length > 0
      ? `v${currentIndex + 1} of ${versions.length}`
      : reportId
        ? "v1"
        : null;

  const statusKey = (status ?? "draft") as keyof typeof STATUS_STYLES;

  return (
    <div className="mb-5 space-y-3 no-print">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-[12px] text-muted-foreground">
        <Link to="/dashboard" className="hover:text-foreground transition-colors">My Analyses</Link>
        <ChevronRight className="h-3.5 w-3.5 opacity-50" />
        <span className="truncate text-foreground/80">{title || "Untitled report"}</span>
      </nav>

      {/* Title row */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-[22px] font-semibold tracking-tight text-foreground">
              {title || "Untitled report"}
            </h1>
            {status && (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ring-1 ring-inset",
                  STATUS_STYLES[statusKey] ?? STATUS_STYLES.draft,
                )}
              >
                {STATUS_LABEL[statusKey] ?? "Draft"}
              </span>
            )}
            {versionLabel && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 px-2 text-[11px] font-medium uppercase tracking-wider"
                    disabled={!versions || versions.length === 0}
                  >
                    {loadingVersions ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <GitBranch className="h-3 w-3" />
                    )}
                    {versionLabel}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64">
                  <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Versions
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {(versions ?? []).map((v, i) => {
                    const isCurrent = v.id === reportId;
                    return (
                      <DropdownMenuItem
                        key={v.id}
                        onClick={() => { if (!isCurrent) navigate(`/reports/${v.id}${versionSearch}`); }}
                        className={cn(
                          "flex items-center justify-between gap-3",
                          isCurrent && "bg-accent",
                        )}
                      >
                        <span className="flex items-center gap-2 text-sm">
                          <span className="font-medium">v{i + 1}</span>
                          {isCurrent && (
                            <span className="rounded bg-primary/15 px-1.5 text-[10px] font-semibold uppercase text-primary">
                              Viewing now
                            </span>
                          )}
                          {i === (versions?.length ?? 0) - 1 && (
                            <span className="rounded bg-accent px-1.5 text-[10px] font-semibold uppercase text-foreground">
                              Latest
                            </span>
                          )}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {new Date(v.created_at).toLocaleDateString()}
                        </span>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
};

export default WorkspaceHeader;
