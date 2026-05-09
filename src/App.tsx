import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { TenantLayout } from "@/layouts/TenantLayout";
import Index from "./pages/Index";

const Analyze = lazy(() => import("./pages/Analyze"));
const TenantResults = lazy(() => import("./pages/TenantResults"));
const Auth = lazy(() => import("./pages/Auth"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const SharedReport = lazy(() => import("./pages/SharedReport"));
const ReportDetails = lazy(() => import("./pages/ReportDetails"));
const Compare = lazy(() => import("./pages/Compare"));
const WorkspaceRedirect = lazy(() => import("./pages/WorkspaceRedirect"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={null}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/r/:slug" element={<SharedReport />} />

              {/* Compatibility redirects for old account-based URLs. */}
              <Route path="/analyze" element={<ProtectedRoute><WorkspaceRedirect target="analyze" /></ProtectedRoute>} />
              <Route path="/results" element={<ProtectedRoute><WorkspaceRedirect target="results" /></ProtectedRoute>} />
              <Route path="/dashboard" element={<ProtectedRoute><WorkspaceRedirect target="dashboard" /></ProtectedRoute>} />
              <Route path="/compare" element={<ProtectedRoute><WorkspaceRedirect target="compare" /></ProtectedRoute>} />

              {/* Tenant-scoped SaaS workspace routes. */}
              <Route path="/t/:tenantSlug" element={<ProtectedRoute><TenantLayout /></ProtectedRoute>}>
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="analyze" element={<Analyze />} />
                <Route path="results" element={<TenantResults />} />
                <Route path="reports/:reportId" element={<ReportDetails />} />
                <Route path="compare" element={<Compare />} />
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
