import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, History } from "lucide-react";
import { statusLabel } from "@/lib/format";

interface StatusEvent {
  id: string;
  report_id: string;
  changed_by: string | null;
  from_status: string | null;
  to_status: string | null;
  note: string | null;
  change_source: string;
  created_at: string;
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const pill = (status: string | null) => (
  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
    {status ? statusLabel(status) : "—"}
  </span>
);

/**
 * Activity tab — surfaces the report's status history through an exact-report
 * RPC so public audit rows cannot be enumerated through the table API.
 */
export const ActivityTab = ({ reportId, refreshKey = 0 }: { reportId: string; refreshKey?: number }) => {
  const [events, setEvents] = useState<StatusEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void supabase
      .rpc("get_report_status_history", { p_report_id: reportId })
      .then(({ data }) => {
        if (cancelled) return;
        setEvents((data ?? []) as StatusEvent[]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reportId, refreshKey]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-lg font-semibold tracking-tight">Status History</h2>
        <p className="text-xs text-muted-foreground">
          Status changes for this report.
        </p>
      </div>

      {events.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40 p-10 text-center">
          <History className="mb-2 h-5 w-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No activity yet.</p>
          <p className="text-xs text-muted-foreground/80">
            Status changes will appear here once you move this report through review.
          </p>
        </div>
      ) : (
        <ol className="relative space-y-3 border-l border-border pl-5">
          {events.map((event) => (
            <li key={event.id} className="relative">
              <span className="absolute -left-[23px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-background" />
              <div className="rounded-lg border border-border bg-card/60 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  {pill(event.from_status)}
                  <span className="text-xs text-muted-foreground">→</span>
                  {pill(event.to_status)}
                  <span className="ml-auto text-[11px] text-muted-foreground">{fmt(event.created_at)}</span>
                </div>
                {event.note && <p className="mt-1.5 text-[13px] text-foreground/90">{event.note}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};

export default ActivityTab;