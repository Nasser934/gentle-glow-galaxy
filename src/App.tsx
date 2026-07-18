import { lazy, Suspense, type ComponentType } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, useParams } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { LoadingScreen } from "@/components/LoadingScreen";

// Retry dynamic imports once, then force a hard reload on the second failure.
// Prevents blank screens when a lazy chunk 404s after a redeploy.
const lazyWithRetry = <T extends ComponentType<Record<string, never>>>(
  factory: () => Promise<{ default: T }>,
) =>
  lazy(async () => {
    const reloadKey = "lovable:chunk-reloaded";
    try {
      const loaded = await factory();
      if (typeof window !== "undefined") sessionStorage.removeItem(reloadKey);
      return loaded;
    } catch (err) {
      if (typeof window !== "undefined" && !sessionStorage.getItem(reloadKey)) {
        sessionStorage.setItem(reloadKey, "1");
        window.location.reload();
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

const queryClient = new QueryClient();

import { AppShell } from "@/components/AppShell";

const Shelled = ({ children }: { children: React.ReactNode }) => (
  <AppShell>{children}</AppShell>
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

const RoutedApp = () => {
  const location = useLocation();
  return (
    <AppErrorBoundary resetKey={`${location.pathname}${location.search}`}>
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/demo" element={<Shelled><Results /></Shelled>} />
          <Route path="/r/:slug" element={<SharedReport />} />
          <Route path="/analyze" element={<ProtectedRoute><Shelled><Analyze /></Shelled></ProtectedRoute>} />
          <Route path="/results" element={<ProtectedRoute><Shelled><Results /></Shelled></ProtectedRoute>} />
          <Route path="/reports/:reportId" element={<ProtectedRoute><Shelled><Results /></Shelled></ProtectedRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute><Shelled><Dashboard /></Shelled></ProtectedRoute>} />
          <Route path="/compare" element={<ProtectedRoute><Shelled><Compare /></Shelled></ProtectedRoute>} />
          <Route path="/decision-room" element={<ProtectedRoute><Shelled><DecisionRoomEntry /></Shelled></ProtectedRoute>} />
          <Route path="/decision-room/:reportId" element={<DemoOrProtected><Shelled><DecisionRoom /></Shelled></DemoOrProtected>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </AppErrorBoundary>
  );
};

const App = () => (
  <AppErrorBoundary resetKey="global">
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <RoutedApp />
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </AppErrorBoundary>
);

export default App;
