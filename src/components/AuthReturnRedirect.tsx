import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { consumeAuthReturnPath } from "@/lib/authRedirect";

export const AuthReturnRedirect = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (loading || !user) return;

    const target = consumeAuthReturnPath(window.sessionStorage);
    if (!target) return;

    const current = `${location.pathname}${location.search}${location.hash}`;
    if (current !== target) navigate(target, { replace: true });
  }, [loading, user, navigate, location.pathname, location.search, location.hash]);

  return null;
};
