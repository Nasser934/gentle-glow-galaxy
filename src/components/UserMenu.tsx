import { useNavigate } from "react-router-dom";
import { LogOut, User as UserIcon, FolderOpen, GitCompare } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";


export const UserMenu = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  if (!user) {
    return (
      <Button size="sm" variant="outline" onClick={() => navigate("/auth")}
        className="h-8 rounded-md border-border/70 bg-card/40 px-3 text-[13px] font-medium hover:bg-card">
        Sign in
      </Button>
    );
  }
  const initial = (user.user_metadata?.display_name || user.email || "?")[0].toUpperCase();
  return (
    <div className="flex items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-[13px] font-semibold text-primary ring-1 ring-inset ring-primary/30 hover:bg-primary/25">
            {initial}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{user.email}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => navigate("/dashboard")}>
            <FolderOpen className="mr-2 h-4 w-4" /> My analyses
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate("/compare")}>
            <GitCompare className="mr-2 h-4 w-4" /> Compare
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => signOut().then(() => navigate("/"))}>
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
