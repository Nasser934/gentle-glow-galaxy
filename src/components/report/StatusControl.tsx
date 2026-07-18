import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateReportStatus, type ReportRow } from "@/lib/reports";
import { statusLabel } from "@/lib/format";
import { toast } from "sonner";

export const StatusControl = ({ report, onChanged }: { report: ReportRow; onChanged?: (s: ReportRow["status"]) => void }) => {
  const change = async (s: ReportRow["status"]) => {
    try { await updateReportStatus(report.id, s); toast.success(`Status updated: ${statusLabel(s)}`); onChanged?.(s); }
    catch (error: unknown) { toast.error(error instanceof Error ? error.message : "Status update failed"); }
  };
  const isStatus = (value: string): value is ReportRow["status"] =>
    ["draft", "in_review", "approved", "rejected"].includes(value);
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Status</span>
      <Select value={report.status} onValueChange={(value) => { if (isStatus(value)) void change(value); }}>
        <SelectTrigger className="h-8 w-[140px] text-[13px]" aria-label="Change report status"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="draft">Draft</SelectItem>
          <SelectItem value="in_review">In Review</SelectItem>
          <SelectItem value="approved">Approved</SelectItem>
          <SelectItem value="rejected">Rejected</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
};
