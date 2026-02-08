import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, BarChart3, Download, FileText, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnalysisResult, ConceptInputs } from "@/types/analysis";
import ScoreGauge from "@/components/ScoreGauge";
import RiskHeatmap from "@/components/RiskHeatmap";
import RecommendationBadge from "@/components/RecommendationBadge";
import ReactMarkdown from "react-markdown";
import { useRef } from "react";

const Results = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const reportRef = useRef<HTMLDivElement>(null);
  const result = location.state?.result as AnalysisResult | undefined;
  const inputs = location.state?.inputs as ConceptInputs | undefined;

  if (!result || !inputs) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <h2 className="font-display text-2xl font-bold text-foreground">No Analysis Results</h2>
          <p className="mt-2 text-muted-foreground">Please run an analysis first.</p>
          <Button onClick={() => navigate("/analyze")} className="mt-6">Start New Analysis</Button>
        </div>
      </div>
    );
  }

  const handlePrint = () => window.print();

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border bg-card no-print">
        <div className="container mx-auto flex items-center justify-between px-6 py-4">
          <button onClick={() => navigate("/")} className="flex items-center gap-2 text-foreground hover:text-primary transition-colors">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg hero-gradient">
              <BarChart3 className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-display text-lg font-bold">Concept AI</span>
          </button>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => navigate("/analyze")} className="gap-2">
              <ArrowLeft className="h-4 w-4" /> New Analysis
            </Button>
            <Button onClick={handlePrint} className="gap-2">
              <Download className="h-4 w-4" /> Download Report
            </Button>
          </div>
        </div>
      </nav>

      <div ref={reportRef} className="container mx-auto max-w-5xl px-6 py-10">
        {/* Title */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <p className="text-sm font-medium text-primary">Feasibility Analysis Report</p>
          <h1 className="font-display text-3xl font-bold text-foreground">{inputs.projectName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{inputs.industry} • {inputs.budgetRange} • {inputs.timeline}</p>
        </motion.div>

        {/* Scorecard */}
        <section className="mb-10">
          <h2 className="mb-4 font-display text-xl font-semibold text-foreground flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" /> Feasibility Scorecard
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            <ScoreGauge label="Value" score={result.scores.value} explanation={result.scores.valueExplanation} />
            <ScoreGauge label="Risk" score={result.scores.risk} explanation={result.scores.riskExplanation} />
            <ScoreGauge label="Complexity" score={result.scores.complexity} explanation={result.scores.complexityExplanation} />
          </div>
        </section>

        {/* Recommendation */}
        <section className="mb-10">
          <RecommendationBadge
            recommendation={result.recommendation}
            reasoning={result.recommendationReasoning}
            keyFactors={result.keyFactors}
          />
        </section>

        {/* Risk Heatmap */}
        <section className="mb-10">
          <RiskHeatmap risks={result.risks} />
        </section>

        {/* Summary & Insights */}
        <div className="grid gap-6 md:grid-cols-2 mb-10">
          <div className="rounded-xl border border-border bg-card p-6 card-shadow">
            <h3 className="mb-3 font-display text-lg font-semibold text-foreground flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" /> Feasibility Summary
            </h3>
            <div className="prose prose-sm text-foreground max-w-none">
              <ReactMarkdown>{result.summary}</ReactMarkdown>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-6 card-shadow">
            <h3 className="mb-3 font-display text-lg font-semibold text-foreground flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-primary" /> Assumptions & Confidence
            </h3>
            <ul className="space-y-2">
              {result.assumptions.map((a, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className={`mt-1 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                    a.confidence === "high" ? "bg-success/10 text-success" :
                    a.confidence === "medium" ? "bg-warning/10 text-warning" :
                    "bg-destructive/10 text-destructive"
                  }`}>{a.confidence}</span>
                  <span className="text-foreground">{a.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Next Steps */}
        <section className="rounded-xl border border-border bg-card p-6 card-shadow mb-10">
          <h3 className="mb-3 font-display text-lg font-semibold text-foreground">Suggested Next Steps</h3>
          <ol className="list-decimal list-inside space-y-2">
            {result.nextSteps.map((step, i) => (
              <li key={i} className="text-sm text-foreground">{step}</li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
};

export default Results;
