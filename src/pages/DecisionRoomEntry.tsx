import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Gavel, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Disambiguation page for `/decision-room` (no :reportId).
 *
 * Resolution rules (synchronous):
 *  - If sessionStorage has `conceptai:currentReportId`, redirect to that room.
 *  - Otherwise show a terminal empty-state pointing to My Analyses.
 *
 * We intentionally render a real page (not a redirect to /dashboard with a toast)
 * so the sidebar entry is bookmarkable and the user understands why DR is per-report.
 */
const DecisionRoomEntry = () => {
  const navigate = useNavigate();
  // Resolve once on mount; do not re-read on re-render so we don't loop.
  const [target] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem("conceptai:currentReportId");
    } catch {
      return null;
    }
  });

  // If we have a remembered report, jump straight in.
  useEffect(() => {
    // no-op — handled via <Navigate /> below
  }, []);

  if (target) {
    return <Navigate to={`/decision-room/${target}`} replace />;
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center text-center">
      <div className="mt-6 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Gavel className="h-6 w-6" strokeWidth={1.75} />
      </div>
      <h1 className="mt-4 text-[22px] font-semibold tracking-tight">Decision Room</h1>
      <p className="mt-2 max-w-md text-[13px] text-muted-foreground">
        The Decision Room runs on a specific analysis. Pick one from
        <span className="text-foreground"> My Analyses</span> to enter its review workspace.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Button onClick={() => navigate("/dashboard")} className="h-9 gap-2">
          <FolderOpen className="h-4 w-4" /> Open My Analyses
        </Button>
        <Button
          variant="outline"
          onClick={() => navigate("/decision-room/demo")}
          className="h-9"
        >
          Try the demo room
        </Button>
      </div>
    </div>
  );
};

export default DecisionRoomEntry;
