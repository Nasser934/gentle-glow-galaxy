import { Link, Outlet } from "react-router-dom";
import { BarChart3 } from "lucide-react";
import { OrgSwitcher } from "@/components/OrgSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UserMenu } from "@/components/UserMenu";
import { TenantProvider } from "@/contexts/TenantContext";

export function TenantLayout() {
  return (
    <TenantProvider>
      <div className="min-h-screen bg-background text-foreground">
        <nav className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
          <div className="container mx-auto flex h-14 items-center justify-between px-6">
            <div className="flex items-center gap-4">
              <Link to="/" className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15 ring-1 ring-inset ring-primary/30">
                  <BarChart3 className="h-3.5 w-3.5 text-primary" />
                </div>
                <span className="text-[15px] font-medium tracking-tight">Concept AI</span>
              </Link>
              <OrgSwitcher />
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <UserMenu />
            </div>
          </div>
        </nav>
        <Outlet />
      </div>
    </TenantProvider>
  );
}
