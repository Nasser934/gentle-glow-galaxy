import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";

interface Comment {
  id: string;
  report_id: string;
  user_id: string;
  section: string | null;
  body: string;
  created_at: string;
}

type CommentProfile = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
};

export const CommentsPanel = ({ reportId, section }: { reportId: string; section?: string }) => {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Record<string, { display_name: string | null; avatar_url: string | null }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data, error }, { data: profileRows, error: profileError }] = await Promise.all([
      supabase.rpc("get_report_comments", {
        p_report_id: reportId,
        p_section: section ?? null,
      }),
      supabase.rpc("get_report_comment_profiles", { p_report_id: reportId }),
    ]);

    if (error) {
      toast.error(error.message);
      setComments([]);
      setProfiles({});
      setLoading(false);
      return;
    }

    setComments((data ?? []) as Comment[]);
    const map: Record<string, { display_name: string | null; avatar_url: string | null }> = {};
    if (!profileError) {
      ((profileRows ?? []) as CommentProfile[]).forEach((profile) => {
        map[profile.user_id] = {
          display_name: profile.display_name,
          avatar_url: profile.avatar_url,
        };
      });
    }
    setProfiles(map);
    setLoading(false);
  }, [reportId, section]);

  useEffect(() => { void load(); }, [load]);

  const submit = async () => {
    if (!user) { toast.error("Sign in to comment"); return; }
    if (!body.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("report_comments").insert({
      report_id: reportId,
      user_id: user.id,
      body: body.trim(),
      section: section ?? null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setBody("");
    await load();
  };

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No comments yet.</p>
      ) : (
        <div className="space-y-3">
          {comments.map((comment) => {
            const profile = profiles[comment.user_id];
            const name = profile?.display_name || "User";
            const initial = name[0].toUpperCase();
            return (
              <div key={comment.id} className="flex gap-3 rounded-lg border border-border/60 bg-card/40 p-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">{initial}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[13px] font-medium">{name}</span>
                    <span className="text-[11px] text-muted-foreground">{new Date(comment.created_at).toLocaleString()}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">{comment.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {user ? (
        <div className="space-y-2">
          <Textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Add a comment…" rows={3} maxLength={2000} />
          <div className="flex justify-end">
            <Button size="sm" onClick={submit} disabled={busy || !body.trim()} className="gap-1.5">
              <Send className="h-3.5 w-3.5" /> Post
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground"><Link to="/auth" className="text-primary hover:underline">Sign in</Link> to join the discussion.</p>
      )}
    </div>
  );
};