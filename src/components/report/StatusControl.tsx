import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateReportStatus, type ReportRow } from "@/lib/reports";
import { statusLabel } from "@/lib/format";
import { toast } from "sonner";
import { useState } from "react";

export const StatusControl = ({ report, onChanged }: { report: ReportRow; onChanged?: (s: ReportRow["status"]) => void }) => {
  const [saving, setSaving] = useState(false);
  const change = async (s: ReportRow["status"]) => {
    if (saving || s === report.status) return;
    setSaving(true);
    try {
      await updateReportStatus(report.id, s);
      setSaving(false);
      toast.success(`Status updated: ${statusLabel(s)}`);
      onChanged?.(s);
    } catch (error: unknown) {
      setSaving(false);
      toast.error(error instanceof Error ? error.message : "Status update failed");
    }
  };
  const isStatus = (value: string): value is ReportRow["status"] =>
    ["draft", "in_review", "approved", "rejected"].includes(value);
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Status</span>
      <Select disabled={saving} value={report.status} onValueChange={(value) => { if (isStatus(value)) void change(value); }}>
        <SelectTrigger className="h-8 w-[140px] text-[13px]" aria-label={saving ? "Saving report status" : "Change report status"}><SelectValue /></SelectTrigger>
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
