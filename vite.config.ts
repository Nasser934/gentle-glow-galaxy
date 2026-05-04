import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    target: "es2020",
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (!id.includes("node_modules")) return;
          if (id.includes("recharts") || id.includes("d3-")) return "charts";
          if (id.includes("jspdf") || id.includes("html2canvas") || id.includes("exceljs") || id.includes("pptxgenjs")) return "exporters";
          if (id.includes("framer-motion")) return "motion";
          if (id.includes("react-markdown") || id.includes("remark") || id.includes("micromark") || id.includes("mdast") || id.includes("hast")) return "markdown";
          if (id.includes("@radix-ui")) return "radix";
          if (id.includes("@supabase")) return "supabase";
          if (id.includes("react-router") || id.includes("react-dom") || id.includes("/react/")) return "react-vendor";
        },
      },
    },
  },
}));
