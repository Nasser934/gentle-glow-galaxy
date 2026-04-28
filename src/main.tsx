import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { applyInitialTheme } from "./components/ThemeToggle";

applyInitialTheme();

createRoot(document.getElementById("root")!).render(<App />);
