import { ReactNode, useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  PlusCircle,
  GitCompare,
  Gavel,
  Menu,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UserMenu } from "@/components/UserMenu";
import { AnalysisJobsIndicator } from "@/components/AnalysisJobsIndicator";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** Optional custom matcher — defaults to exact pathname match. */
  match?: (path: string) => boolean;
}

const NAV: NavItem[] = [
  { to: "/dashboard", label: "My Analyses", icon: LayoutDashboard },
  { to: "/analyze", label: "New Analysis", icon: PlusCircle },
  { to: "/compare", label: "Compare", icon: GitCompare },
  {
    to: "/decision-room",
    label: "Decision Room",
    icon: Gavel,
    match: (path) => path === "/decision-room" || path.startsWith("/decision-room/"),
  },
];

interface AppShellProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
}

export const AppShell = ({ children, title, subtitle, actions }: AppShellProps) => {
  const { pathname } = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Close mobile drawer on any route change (including programmatic navigation).
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Esc closes the drawer; focus first link on open; trap Tab inside drawer; restore focus on close.
  useEffect(() => {
    if (!mobileOpen) return;
    const getFocusable = () =>
      Array.from(
        drawerRef.current?.querySelectorAll<HTMLElement>(
          'a, button, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((el) => !el.hasAttribute("disabled"));

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobileOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const items = getFocusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !drawerRef.current?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    getFocusable()[0]?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      hamburgerRef.current?.focus();
    };
  }, [mobileOpen]);

  const SidebarBody = (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center border-b border-sidebar-border px-4">
        <Logo to="/dashboard" size={20} />
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {NAV.map((item) => {
          const active = item.match ? item.match(pathname) : pathname === item.to;
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={cn(
                "group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-3 text-[11px] text-muted-foreground">
        <div className="font-medium uppercase tracking-wider">Concept AI</div>
        <div className="mt-0.5">Feasibility Intelligence</div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 border-r border-sidebar-border bg-sidebar lg:block">
        {SidebarBody}
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside
            ref={drawerRef}
            id="app-mobile-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Main navigation"
            className="absolute inset-y-0 left-0 w-[85vw] max-w-xs border-r border-sidebar-border bg-sidebar shadow-xl"
            style={{
              paddingTop: "env(safe-area-inset-top, 0px)",
              paddingBottom: "env(safe-area-inset-bottom, 0px)",
            }}
          >
            {SidebarBody}
          </aside>
        </div>
      )}

      <div className="lg:pl-56">
        {/* Top bar */}
        <header
          className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur-xl lg:px-6"
          style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
        >
          <button
            ref={hamburgerRef}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            aria-expanded={mobileOpen}
            aria-controls="app-mobile-drawer"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Title slot — reserved for breadcrumbs in a later phase. */}
          <div className="flex-1" />

          <div className="flex items-center gap-1.5">
            <Button asChild size="sm" variant="outline" className="h-8 gap-1.5">
              <Link to="/analyze">
                <PlusCircle className="h-3.5 w-3.5" /> New report
              </Link>
            </Button>
            <ThemeToggle />
            <UserMenu />
          </div>
        </header>

        {/* Global background-analysis indicator */}
        <AnalysisJobsIndicator />

        {/* Page header */}
        {(title || actions) && (
          <div className="border-b border-border bg-background px-4 py-5 lg:px-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                {title && (
                  <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
                    {title}
                  </h1>
                )}
                {subtitle && (
                  <p className="mt-0.5 text-[13px] text-muted-foreground">{subtitle}</p>
                )}
              </div>
              {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
            </div>
          </div>
        )}

        <main className="px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
};

export default AppShell;
