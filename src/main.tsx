import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { applyInitialTheme } from "./components/ThemeToggle";
import { AppErrorBoundary } from "./components/AppErrorBoundary";

applyInitialTheme();

const rootEl = document.getElementById("root");

if (!rootEl) {
  throw new Error("Root element not found");
}

createRoot(rootEl).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>,
);
