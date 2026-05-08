import { Loader2 } from "lucide-react";

export const PageLoader = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="Loading" />
  </div>
);
