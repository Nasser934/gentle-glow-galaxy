import { lazy, Suspense, type ComponentType } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useParams } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import { Loader2 } from "lucide-react";
import { ReportRouteErrorBoundary } from "@/components/report/ReportRouteErrorBoundary";

// Retry dynamic imports once, then force a hard reload on the second failure.
// Prevents blank screens when a lazy chunk 404s after a redeploy.
const lazyWithRetry = <T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
) =>
  lazy(async () => {
    const reloadKey = "lovable:chunk-reloaded";
    try {
      return await factory();
    } catch (err) {
      if (typeof window !== "undefined" && !sessionStorage.getItem(reloadKey)) {
        sessionStorage.setItem(reloadKey, "1");
        window.location.reload();
        return await new Promise<{ default: T }>(() => {});
      }
      throw err;
    }
  });

const Analyze = lazyWithRetry(() => import("./pages/Analyze"));
const Results = lazyWithRetry(() => import("./pages/Results"));
const Auth = lazyWithRetry(() => import("./pages/Auth"));
const Dashboard = lazyWithRetry(() => import("./pages/Dashboard"));
const SharedReport = lazyWithRetry(() => import("./pages/SharedReport"));
const Compare = lazyWithRetry(() => import("./pages/Compare"));
const DecisionRoom = lazyWithRetry(() => import("./pages/DecisionRoom"));
const DecisionRoomEntry = lazyWithRetry(() => import("./pages/DecisionRoomEntry"));
const NotFound = lazyWithRetry(() => import("./pages/NotFound"));
const OAuthConsent = lazyWithRetry(() => import("./pages/OAuthConsent"));

const queryClient = new QueryClient();

import { AppShell } from "@/components/AppShell";

const Shelled = ({ children }: { children: React.ReactNode }) => (
  <AppShell>{children}</AppShell>
);

const AppLoadingScreen = () => (
  <div
    className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background text-foreground"
    role="status"
    aria-live="polite"
  >
    <Loader2 className="h-7 w-7 animate-spin text-primary" aria-hidden="true" />
    <p className="text-sm font-medium">Loading Concept AI…</p>
  </div>
);

/**
 * Decision Room is per-report and protected — except for the public demo case,
 * which must remain reachable without auth so anyone can preview Judge Mode.
 */
const DemoOrProtected = ({ children }: { children: React.ReactNode }) => {
  const { reportId } = useParams();
  if (reportId === "demo") return <>{children}</>;
  return <ProtectedRoute>{children}</ProtectedRoute>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<AppLoadingScreen />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
              <Route path="/r/:slug" element={<ReportRouteErrorBoundary><SharedReport /></ReportRouteErrorBoundary>} />
              <Route path="/analyze" element={<ProtectedRoute><Shelled><Analyze /></Shelled></ProtectedRoute>} />
              <Route path="/results" element={<ProtectedRoute><ReportRouteErrorBoundary><Shelled><Results /></Shelled></ReportRouteErrorBoundary></ProtectedRoute>} />
              <Route path="/reports/:reportId" element={<ProtectedRoute><ReportRouteErrorBoundary><Shelled><Results /></Shelled></ReportRouteErrorBoundary></ProtectedRoute>} />
              <Route path="/dashboard" element={<ProtectedRoute><Shelled><Dashboard /></Shelled></ProtectedRoute>} />
              <Route path="/compare" element={<ProtectedRoute><Shelled><Compare /></Shelled></ProtectedRoute>} />
              <Route path="/decision-room" element={<ProtectedRoute><Shelled><DecisionRoomEntry /></Shelled></ProtectedRoute>} />
              <Route path="/decision-room/:reportId" element={<DemoOrProtected><ReportRouteErrorBoundary><Shelled><DecisionRoom /></Shelled></ReportRouteErrorBoundary></DemoOrProtected>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
