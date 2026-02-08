import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, BarChart3, Shield, Zap, Target, Building2, Cpu, Landmark, Globe, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";

const features = [
  {
    icon: BarChart3,
    title: "Feasibility Scorecard",
    description: "AI-generated Value, Risk & Complexity scores with clear visual indicators and explanations.",
  },
  {
    icon: Shield,
    title: "Risk Heatmap",
    description: "Visual risk matrix plotting likelihood vs. impact with suggested mitigations for each risk.",
  },
  {
    icon: Target,
    title: "Go / No-Go Recommendation",
    description: "Clear, data-driven recommendation with AI reasoning and key decision factors.",
  },
  {
    icon: Zap,
    title: "Instant Analysis",
    description: "From concept input to comprehensive report in seconds — powered by advanced AI.",
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
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <header className="relative overflow-hidden">
        <div className="hero-gradient absolute inset-0 opacity-[0.03] pointer-events-none" />
        <nav className="container mx-auto flex items-center justify-between px-6 py-5">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg hero-gradient">
              <BarChart3 className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-display text-xl font-bold text-foreground">Concept AI</span>
          </div>
          <Button type="button" onClick={() => navigate("/analyze")} size="sm">
            Start Analysis
          </Button>
        </nav>

        <div className="container mx-auto px-6 pb-24 pt-20 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="mx-auto mb-6 inline-flex items-center rounded-full border border-border bg-card px-4 py-1.5 text-sm text-muted-foreground">
              <Zap className="mr-2 h-3.5 w-3.5 text-primary" />
              AI-Powered Feasibility Analysis
            </div>
            <h1 className="mx-auto max-w-3xl font-display text-5xl font-bold leading-tight tracking-tight text-foreground md:text-6xl">
              Smarter Go/No-Go Decisions,{" "}
              <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                Before You Invest
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
              Evaluate project concepts with structured, AI-driven feasibility analysis. Get instant
              scores, risk assessments, and data-backed recommendations.
            </p>
          </motion.div>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Button type="button" size="lg" onClick={() => navigate("/analyze")} className="gap-2 px-8 text-base">
              Start New Analysis <ArrowRight className="h-4 w-4" />
            </Button>
            <Button type="button" size="lg" variant="outline" onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })}>
              Learn More
            </Button>
          </div>
        </div>
      </header>

      {/* Features */}
      <section id="features" className="container mx-auto px-6 py-24">
        <div className="mb-16 text-center">
          <h2 className="font-display text-3xl font-bold text-foreground">
            Everything You Need to Evaluate a Concept
          </h2>
          <p className="mt-3 text-muted-foreground">
            From structured input to executive-ready reports — in minutes, not weeks.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
              className="rounded-xl border border-border bg-card p-6 card-shadow transition-shadow hover:card-shadow-hover"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-accent">
                <f.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-display text-lg font-semibold text-foreground">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.description}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Industries */}
      <section className="border-t border-border bg-card py-16">
        <div className="container mx-auto px-6 text-center">
          <p className="mb-8 text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Built for Project-Driven Industries
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8">
            {industries.map((ind) => (
              <div key={ind.label} className="flex items-center gap-2 text-muted-foreground">
                <ind.icon className="h-5 w-5" />
                <span className="text-sm font-medium">{ind.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="container mx-auto px-6 text-center text-sm text-muted-foreground">
          © 2026 Concept AI — AI-Powered Feasibility Analysis
        </div>
      </footer>
    </div>
  );
};

export default Index;
