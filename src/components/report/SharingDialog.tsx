import { useMemo, useState } from "react";
import { Check, Copy, Globe2, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { setReportVisibility } from "@/lib/reports";

interface SharingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportId: string;
  slug: string;
  isPublic: boolean;
  onVisibilityChanged: (isPublic: boolean) => void;
}

async function copyToClipboard(value: string) {
  if (!navigator.clipboard?.writeText) throw new Error("Clipboard access is unavailable.");
  await navigator.clipboard.writeText(value);
}

export function SharingDialog({
  open,
  onOpenChange,
  reportId,
  slug,
  isPublic,
  onVisibilityChanged,
}: SharingDialogProps) {
  const [busy, setBusy] = useState<"enable" | "disable" | "copy" | null>(null);
  const [copied, setCopied] = useState(false);
  const shareUrl = useMemo(() => `${window.location.origin}/r/${slug}`, [slug]);

  const copyLink = async () => {
    if (!isPublic) {
      toast.error("Enable sharing before copying the external link.");
      return;
    }
    setBusy("copy");
    try {
      await copyToClipboard(shareUrl);
      setCopied(true);
      toast.success("Public share link copied");
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      toast.info("Copy this link manually", { description: shareUrl });
    } finally {
      setBusy(null);
    }
  };

  const enableSharing = async () => {
    setBusy("enable");
    try {
      const updated = await setReportVisibility(reportId, true);
      onVisibilityChanged(updated.is_public);
      try {
        await copyToClipboard(shareUrl);
        setCopied(true);
        toast.success("Sharing enabled and link copied");
        window.setTimeout(() => setCopied(false), 2_000);
      } catch {
        toast.success("Sharing enabled");
        toast.info("Copy this link manually", { description: shareUrl });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not enable sharing");
    } finally {
      setBusy(null);
    }
  };

  const disableSharing = async () => {
    setBusy("disable");
    try {
      const updated = await setReportVisibility(reportId, false);
      onVisibilityChanged(updated.is_public);
      setCopied(false);
      toast.success("Sharing disabled. Existing external access is revoked.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not disable sharing");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report sharing</DialogTitle>
          <DialogDescription>
            Public links are read-only. Only the owner can enable or revoke access.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div className="flex items-center gap-2">
              {isPublic ? <Globe2 className="h-4 w-4 text-success" /> : <Lock className="h-4 w-4 text-muted-foreground" />}
              <div>
                <p className="text-sm font-medium">{isPublic ? "Shared" : "Private"}</p>
                <p className="text-xs text-muted-foreground">
                  {isPublic ? "Anyone with the link can view this report." : "Only you can access this report."}
                </p>
              </div>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${isPublic ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
              {isPublic ? "Public link on" : "Public link off"}
            </span>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="report-share-link" className="text-xs font-medium text-muted-foreground">Share link</label>
            <div className="flex gap-2">
              <Input id="report-share-link" value={shareUrl} readOnly aria-label="Share link" />
              <Button variant="outline" onClick={copyLink} disabled={!isPublic || busy !== null} className="gap-1.5">
                {busy === "copy" ? <Loader2 className="h-4 w-4 animate-spin" /> : copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                Copy
              </Button>
            </div>
            {!isPublic && <p className="text-xs text-muted-foreground">This link will not work for external viewers until sharing is enabled.</p>}
          </div>
        </div>

        <DialogFooter>
          {isPublic ? (
            <Button variant="destructive" onClick={disableSharing} disabled={busy !== null}>
              {busy === "disable" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Disable sharing
            </Button>
          ) : (
            <Button onClick={enableSharing} disabled={busy !== null}>
              {busy === "enable" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enable sharing & copy link
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
