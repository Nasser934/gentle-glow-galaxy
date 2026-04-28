import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  Shield,
  Zap,
  Target,
  Building2,
  Cpu,
  Landmark,
  Globe,
  Briefcase,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UserMenu } from "@/components/UserMenu";

const features = [
  {
    icon: BarChart3,
    title: "FMART Scorecard",
    description:
      "Five-axis radar — Feasibility, Market, ROI, Risk, Tech — generated from your inputs and live public signals.",
  },
  {
    icon: Shield,
    title: "Risk Heatmap",
    description: "Quantified risk exposure with mitigations, likelihood and impact ranking.",
  },
  {
    icon: Target,
    title: "Go / No-Go Verdict",
    description: "A defensible recommendation with the reasoning, assumptions and trade-offs surfaced inline.",
  },
  {
    icon: Sparkles,
    title: "Public Research",
    description: "Reddit, HN and Wikipedia signals fused into the report with citations — no API keys required.",
  },
];

const industries = [
  { icon: Cpu, label: "IT & Technology" },
  { icon: Globe, label: "Telecom" },
  { icon: Building2, label: "Infrastructure" },
  { icon: Landmark, label: "Government" },
  { icon: Briefcase, label: "Financial Services" },
  { icon: BarChart3, label: "Real Estate" },
];

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ---------- Nav ---------- */}
      <nav className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto flex h-14 items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15 ring-1 ring-inset ring-primary/30">
              <BarChart3 className="h-3.5 w-3.5 text-primary" />
            </div>
            <span className="text-[15px] font-medium tracking-tight">Concept AI</span>
            <span className="ml-2 hidden rounded-full border border-border/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:inline-block">
              Beta
            </span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button
              type="button"
              size="sm"
              onClick={() => navigate("/analyze")}
              className="h-8 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground hover:bg-primary/90"
            >
              Start analysis
            </Button>
            <UserMenu />
          </div>
        </div>
      </nav>

      {/* ---------- Hero ---------- */}
      <header className="relative overflow-hidden">
        <div className="hero-gradient pointer-events-none absolute inset-0" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

        <div className="container relative mx-auto px-6 pb-28 pt-24 text-center md:pt-32">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="mx-auto mb-8 inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/60 px-3 py-1 text-[12px] font-medium text-muted-foreground backdrop-blur">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
              </span>
              AI feasibility intelligence
            </div>

            <h1 className="mx-auto max-w-4xl text-balance text-5xl font-medium leading-[1.02] tracking-[-0.044em] md:text-[64px] md:leading-[1.02] md:tracking-[-0.058em]">
              Decide before you invest.
              <br />
              <span className="text-muted-foreground">Concept-grade analysis in seconds.</span>
            </h1>

            <p className="mx-auto mt-7 max-w-xl text-[17px] leading-[1.55] text-muted-foreground">
              From a one-line idea to an investor-ready feasibility report — FMART scoring, market sizing,
              risk heatmap and a defensible go/no-go verdict.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <Button
              type="button"
              size="lg"
              onClick={() => navigate("/analyze")}
              className="h-10 gap-2 rounded-md bg-primary px-5 text-[14px] font-medium text-primary-foreground hover:bg-primary/90"
            >
              Start new analysis <ArrowRight className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              size="lg"
              variant="ghost"
              onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })}
              className="h-10 rounded-md border border-border/70 bg-card/40 px-5 text-[14px] font-medium text-foreground hover:bg-card"
            >
              How it works
            </Button>
          </motion.div>

          {/* Faux product preview frame */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="relative mx-auto mt-20 max-w-5xl"
          >
            <div className="rounded-xl border border-border/70 bg-card/40 p-2 shadow-2xl shadow-primary/10 backdrop-blur">
              <div className="rounded-lg border border-border/60 bg-popover/80 p-6 text-left">
                <div className="mb-4 flex items-center justify-between border-b border-border/60 pb-4">
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Feasibility report
                    </div>
                    <div className="mt-0.5 text-[15px] font-medium">Smart-meter rollout · Tier-1 telco</div>
                  </div>
                  <div className="rounded-md border border-success/40 bg-success/10 px-2.5 py-1 text-[11px] font-medium text-success">
                    GO · Confidence 82%
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  {[
                    { k: "Feasibility", v: "84" },
                    { k: "Market", v: "76" },
                    { k: "ROI", v: "71" },
                    { k: "Risk", v: "38" },
                    { k: "Tech", v: "88" },
                  ].map((m) => (
                    <div
                      key={m.k}
                      className="rounded-md border border-border/60 bg-card/60 px-3 py-2.5"
                    >
                      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        {m.k}
                      </div>
                      <div className="mt-1 text-2xl font-medium tracking-tight">{m.v}</div>
                      <div className="mt-2 h-1 overflow-hidden rounded-full bg-border/60">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${m.v}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {/* Glow */}
            <div className="pointer-events-none absolute -inset-x-20 -bottom-10 h-40 bg-primary/20 blur-3xl" />
          </motion.div>
        </div>
      </header>

      {/* ---------- Features ---------- */}
      <section id="features" className="relative border-t border-border/60">
        <div className="container mx-auto px-6 py-24">
          <div className="mb-14 max-w-2xl">
            <div className="mb-3 text-[11px] font-medium uppercase tracking-wider text-primary">
              The platform
            </div>
            <h2 className="text-3xl font-medium tracking-[-0.022em] md:text-4xl md:tracking-[-0.032em]">
              Built for decisions, not slides.
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
              Every artifact is structured, sourced and exportable. No prose padding, no AI slop.
            </p>
          </div>

          <div className="grid gap-px overflow-hidden rounded-xl border border-border/60 bg-border/60 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06, duration: 0.4 }}
                className="group relative flex flex-col gap-3 bg-card p-6 transition-colors hover:bg-popover"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-md border border-border/70 bg-background/60 text-primary">
                  <f.icon className="h-4 w-4" />
                </div>
                <h3 className="text-[15px] font-medium tracking-tight">{f.title}</h3>
                <p className="text-[13px] leading-relaxed text-muted-foreground">{f.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Industries ---------- */}
      <section className="border-t border-border/60 bg-card/30">
        <div className="container mx-auto px-6 py-14">
          <p className="mb-8 text-center text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Trusted patterns for project-driven industries
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-5">
            {industries.map((ind) => (
              <div
                key={ind.label}
                className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
              >
                <ind.icon className="h-4 w-4" />
                <span className="text-[13px] font-medium">{ind.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- CTA ---------- */}
      <section className="border-t border-border/60">
        <div className="container mx-auto px-6 py-24 text-center">
          <h3 className="mx-auto max-w-2xl text-3xl font-medium tracking-[-0.022em] md:text-4xl md:tracking-[-0.032em]">
            Stop arguing about ideas.
            <br />
            <span className="text-muted-foreground">Start measuring them.</span>
          </h3>
          <Button
            type="button"
            size="lg"
            onClick={() => navigate("/analyze")}
            className="mt-8 h-10 gap-2 rounded-md bg-primary px-5 text-[14px] font-medium text-primary-foreground hover:bg-primary/90"
          >
            Run your first analysis <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </section>

      {/* ---------- Footer ---------- */}
      <footer className="border-t border-border/60 py-8">
        <div className="container mx-auto flex flex-col items-center justify-between gap-3 px-6 text-[12px] text-muted-foreground sm:flex-row">
          <div>© 2026 Concept AI</div>
          <div className="flex items-center gap-4">
            <span>FMART™ scoring</span>
            <span className="h-1 w-1 rounded-full bg-border" />
            <span>Public research enabled</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
