import { BarChart3, Loader2 } from "lucide-react";

export function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background" role="status" aria-live="polite">
      <div className="text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
          <BarChart3 className="h-5 w-5 text-primary" />
        </div>
        <div className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading Concept AI…
        </div>
      </div>
    </div>
  );
}
