import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Loader2, BarChart3, Download, MessageSquare, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UserMenu } from "@/components/UserMenu";
import { getReportBySlug, type ReportRow } from "@/lib/reports";
import { InteractiveDashboard } from "@/components/report/InteractiveDashboard";
import { CommentsPanel } from "@/components/report/CommentsPanel";
import { StatusControl } from "@/components/report/StatusControl";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const SharedReport = () => {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [row, setRow] = useState<ReportRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    getReportBySlug(slug)
      .then((r) => { if (!r) setNotFound(true); setRow(r); })
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Could not load report"))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  if (notFound || !row) {
    return (
      <main id="main-content" className="flex min-h-screen items-center justify-center bg-background text-center">
        <div>
          <Lock className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <h2 className="font-display text-xl font-medium">Report not found</h2>
          <p className="mt-1 text-sm text-muted-foreground">It may have been deleted or the link is wrong.</p>
          <Button onClick={() => navigate("/")} className="mt-4">Go home</Button>
        </div>
      </main>
    );
  }

  const isOwner = user?.id === row.user_id;
  const openFullReport = () => navigate("/results", {
    state: {
      report: row.output,
      inputs: row.inputs,
      reportId: row.id,
      slug: row.slug,
      isPublic: row.is_public,
    },
  });

  return (
    <div className="min-h-screen bg-background">
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
            <Button variant="outline" size="sm" onClick={openFullReport}
              className="h-8 rounded-md border-border/70 bg-card/40 px-3 text-[13px] hover:bg-card">
              <Download className="mr-1.5 h-3.5 w-3.5" /> Open full report
            </Button>
            <UserMenu />
          </div>
        </div>
      </nav>

      <main id="main-content" className="container mx-auto px-6 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-primary">Shared analysis</div>
            <h1 className="mt-1 font-display text-2xl font-medium tracking-tight">{row.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{row.industry} · saved {new Date(row.created_at).toLocaleDateString()}</p>
          </div>
          {isOwner && <StatusControl report={row} onChanged={(s) => setRow({ ...row, status: s })} />}
        </div>

        <InteractiveDashboard report={row.output} inputs={row.inputs} />

        <div className="mt-10 border-t border-border pt-6">
          <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-medium tracking-tight">
            <MessageSquare className="h-4 w-4" /> Discussion
          </h2>
          <CommentsPanel reportId={row.id} />
        </div>
      </main>
    </div>
  );
};

export default SharedReport;
