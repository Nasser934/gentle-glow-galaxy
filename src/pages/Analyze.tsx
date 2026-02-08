import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, BarChart3, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ConceptInputs, INDUSTRIES, BUDGET_RANGES, TIMELINES, TEAM_SIZES, TECHNOLOGY_READINESS } from "@/types/analysis";
import { supabase } from "@/integrations/supabase/client";

const STEPS = ["Project Overview", "Scope & Resources", "Assumptions & Constraints", "Risk Inputs"];

const initialInputs: ConceptInputs = {
  projectName: "", industry: "", description: "", strategicObjectives: "",
  budgetRange: "", timeline: "", teamSize: "", dependencies: "",
  assumptions: "", constraints: "", successFactors: "",
  knownRisks: "", regulatoryConsiderations: "", technologyReadiness: "",
};

const Analyze = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [inputs, setInputs] = useState<ConceptInputs>(initialInputs);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const set = (field: keyof ConceptInputs, value: string) =>
    setInputs((prev) => ({ ...prev, [field]: value }));

  const validateStep = () => {
    if (step === 0) {
      if (!inputs.projectName.trim()) { toast.error("Project name is required"); return false; }
      if (!inputs.industry) { toast.error("Please select an industry"); return false; }
      if (!inputs.description.trim()) { toast.error("Description is required"); return false; }
    }
    if (step === 1) {
      if (!inputs.budgetRange) { toast.error("Please select a budget range"); return false; }
      if (!inputs.timeline) { toast.error("Please select a timeline"); return false; }
    }
    return true;
  };

  const next = () => { if (validateStep()) setStep((s) => Math.min(s + 1, 3)); };
  const prev = () => setStep((s) => Math.max(s - 1, 0));

  const handleSubmit = async () => {
    if (!validateStep()) return;
    setIsAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-concept", {
        body: { inputs },
      });
      if (error) throw error;
      navigate("/results", { state: { result: data, inputs } });
    } catch (e: any) {
      console.error("Analysis error:", e);
      toast.error(e?.message || "Analysis failed. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border bg-card">
        <div className="container mx-auto flex items-center justify-between px-6 py-4">
          <button onClick={() => navigate("/")} className="flex items-center gap-2 text-foreground hover:text-primary transition-colors">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg hero-gradient">
              <BarChart3 className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-display text-lg font-bold">Concept AI</span>
          </button>
        </div>
      </nav>

      <div className="container mx-auto max-w-2xl px-6 py-12">
        {/* Progress */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-3">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                  i <= step ? "hero-gradient text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}>
                  {i + 1}
                </div>
                <span className={`hidden text-sm font-medium md:inline ${
                  i <= step ? "text-foreground" : "text-muted-foreground"
                }`}>
                  {s}
                </span>
              </div>
            ))}
          </div>
          <div className="h-1.5 rounded-full bg-muted">
            <div className="h-full rounded-full hero-gradient transition-all duration-500" style={{ width: `${((step + 1) / 4) * 100}%` }} />
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="space-y-6"
          >
            <h2 className="font-display text-2xl font-bold text-foreground">{STEPS[step]}</h2>

            {step === 0 && (
              <>
                <div className="space-y-2">
                  <Label>Project Name *</Label>
                  <Input value={inputs.projectName} onChange={(e) => set("projectName", e.target.value)} placeholder="e.g., Smart Grid Modernization" maxLength={200} />
                </div>
                <div className="space-y-2">
                  <Label>Industry / Sector *</Label>
                  <Select value={inputs.industry} onValueChange={(v) => set("industry", v)}>
                    <SelectTrigger><SelectValue placeholder="Select industry" /></SelectTrigger>
                    <SelectContent>{INDUSTRIES.map((ind) => <SelectItem key={ind} value={ind}>{ind}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Project Description *</Label>
                  <Textarea value={inputs.description} onChange={(e) => set("description", e.target.value)} placeholder="Describe the project concept, its purpose, and expected outcomes..." rows={4} maxLength={2000} />
                </div>
                <div className="space-y-2">
                  <Label>Strategic Objectives</Label>
                  <Textarea value={inputs.strategicObjectives} onChange={(e) => set("strategicObjectives", e.target.value)} placeholder="Key strategic objectives this project aims to achieve..." rows={3} maxLength={1500} />
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <div className="space-y-2">
                  <Label>Estimated Budget Range *</Label>
                  <Select value={inputs.budgetRange} onValueChange={(v) => set("budgetRange", v)}>
                    <SelectTrigger><SelectValue placeholder="Select budget range" /></SelectTrigger>
                    <SelectContent>{BUDGET_RANGES.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Expected Timeline *</Label>
                  <Select value={inputs.timeline} onValueChange={(v) => set("timeline", v)}>
                    <SelectTrigger><SelectValue placeholder="Select timeline" /></SelectTrigger>
                    <SelectContent>{TIMELINES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Team Size</Label>
                  <Select value={inputs.teamSize} onValueChange={(v) => set("teamSize", v)}>
                    <SelectTrigger><SelectValue placeholder="Select team size" /></SelectTrigger>
                    <SelectContent>{TEAM_SIZES.map((ts) => <SelectItem key={ts} value={ts}>{ts}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Key Dependencies</Label>
                  <Textarea value={inputs.dependencies} onChange={(e) => set("dependencies", e.target.value)} placeholder="Third-party vendors, regulatory approvals, other projects..." rows={3} maxLength={1500} />
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div className="space-y-2">
                  <Label>Key Assumptions</Label>
                  <Textarea value={inputs.assumptions} onChange={(e) => set("assumptions", e.target.value)} placeholder="List key assumptions the project is based on..." rows={4} maxLength={1500} />
                </div>
                <div className="space-y-2">
                  <Label>Known Constraints</Label>
                  <Textarea value={inputs.constraints} onChange={(e) => set("constraints", e.target.value)} placeholder="Budget limits, technology restrictions, team availability..." rows={3} maxLength={1500} />
                </div>
                <div className="space-y-2">
                  <Label>Critical Success Factors</Label>
                  <Textarea value={inputs.successFactors} onChange={(e) => set("successFactors", e.target.value)} placeholder="What must go right for this project to succeed?" rows={3} maxLength={1500} />
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <div className="space-y-2">
                  <Label>Known Risks</Label>
                  <Textarea value={inputs.knownRisks} onChange={(e) => set("knownRisks", e.target.value)} placeholder="Describe any known risks, threats, or uncertainties..." rows={4} maxLength={1500} />
                </div>
                <div className="space-y-2">
                  <Label>Regulatory / Compliance Considerations</Label>
                  <Textarea value={inputs.regulatoryConsiderations} onChange={(e) => set("regulatoryConsiderations", e.target.value)} placeholder="Relevant regulations, standards, or compliance requirements..." rows={3} maxLength={1500} />
                </div>
                <div className="space-y-2">
                  <Label>Technology Readiness</Label>
                  <Select value={inputs.technologyReadiness} onValueChange={(v) => set("technologyReadiness", v)}>
                    <SelectTrigger><SelectValue placeholder="Select readiness level" /></SelectTrigger>
                    <SelectContent>{TECHNOLOGY_READINESS.map((tr) => <SelectItem key={tr} value={tr}>{tr}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Navigation Buttons */}
        <div className="mt-10 flex items-center justify-between">
          <Button variant="outline" onClick={step === 0 ? () => navigate("/") : prev} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> {step === 0 ? "Home" : "Back"}
          </Button>
          {step < 3 ? (
            <Button onClick={next} className="gap-2">
              Next <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={isAnalyzing} className="gap-2 px-8">
              {isAnalyzing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Analyzing...
                </>
              ) : (
                <>
                  Run Analysis <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Analyze;
