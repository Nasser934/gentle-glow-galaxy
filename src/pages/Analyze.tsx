import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, BarChart3, Loader2, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UserMenu } from "@/components/UserMenu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  ConceptInputs, INDUSTRIES, BUDGET_RANGES, TIMELINES, TEAM_SIZES, TECHNOLOGY_READINESS,
  BUSINESS_MODELS, REVENUE_MODELS, initialInputs,
} from "@/types/analysis";
import { supabase } from "@/integrations/supabase/client";
import { findTemplate, applyTemplate } from "@/lib/industryTemplates";

const STEPS = ["Project Overview", "Scope & Resources", "Assumptions & Constraints", "Risk Inputs"];

type EssayField =
  | "description" | "strategicObjectives" | "dependencies"
  | "assumptions" | "constraints" | "successFactors"
  | "knownRisks" | "regulatoryConsiderations" | "founderExperience";

type FunctionContext = {
  json?: () => Promise<{ error?: string }>;
  text?: () => Promise<string>;
};

type FunctionErrorWithContext = Error & { context?: FunctionContext };
type AnalysisFunctionName = "analyze-concept-v2" | "analyze-concept";

const messageFromError = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

const getFunctionErrorDetail = async (error: unknown) => {
  if (!(error instanceof Error)) return "Function request failed";
  let detail = error.message;
  const context = (error as FunctionErrorWithContext).context;
  try {
    if (context?.json) {
      const body = await context.json();
      if (body?.error) detail = body.error;
    } else if (context?.text) {
      const text = await context.text();
      if (text) detail = text;
    }
  } catch {
    // Keep original error message.
  }
  return detail;
};

const invokeAnalysisFunction = async (functionName: AnalysisFunctionName, inputs: ConceptInputs) => {
  const { data, error } = await supabase.functions.invoke(functionName, { body: { inputs } });
  if (error) throw new Error(await getFunctionErrorDetail(error));
  if (data?.error) throw new Error(data.error);
  return data;
};

const Analyze = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [inputs, setInputs] = useState<ConceptInputs>(initialInputs);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const [brief, setBrief] = useState("");
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [showBrief, setShowBrief] = useState(true);
  const [completing, setCompleting] = useState<EssayField | null>(null);

  const set = (field: keyof ConceptInputs, value: string) =>
    setInputs((prev) => ({ ...prev, [field]: value }));

  const handleAutoFill = async () => {
    if (brief.trim().length < 10) {
      toast.error("Describe your idea in a sentence or two first.");
      return;
    }
    setIsAutoFilling(true);
    try {
      const { data, error } = await supabase.functions.invoke("autofill-brief", { body: { brief } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setInputs(data.draft);
      setShowBrief(false);
      toast.success("Draft generated. Review & edit before running analysis.");
    } catch (e: unknown) {
      toast.error(messageFromError(e, "Could not generate draft."));
    } finally {
      setIsAutoFilling(false);
    }
  };

  const completeField = async (field: EssayField) => {
    setCompleting(field);
    try {
      const { data, error } = await supabase.functions.invoke("complete-field", {
        body: { field, partial: inputs[field], inputs },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.text) set(field, data.text);
      toast.success("Field completed by AI.");
    } catch (e: unknown) {
      toast.error(messageFromError(e, "AI completion failed."));
    } finally {
      setCompleting(null);
    }
  };

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
      let data;
      try {
        data = await invokeAnalysisFunction("analyze-concept-v2", inputs);
      } catch (primaryError: unknown) {
        console.warn("analyze-concept-v2 failed, retrying legacy analyze-concept", primaryError);
        toast.info("Retrying analysis using the available function…");
        data = await invokeAnalysisFunction("analyze-concept", inputs);
      }
      navigate("/results", { state: { report: data, inputs } });
    } catch (e: unknown) {
      toast.error(messageFromError(e, "Analysis failed. Please try again or check Edge Function deployment."));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const EssayLabel = ({ field, children }: { field: EssayField; children: React.ReactNode }) => (
    <div className="flex items-center justify-between">
      <Label>{children}</Label>
      <Button
        type="button" variant="ghost" size="sm" className="h-7 gap-1 text-xs text-primary hover:bg-accent"
        onClick={() => completeField(field)} disabled={completing === field}
      >
        {completing === field
          ? <><Loader2 className="h-3 w-3 animate-spin" /> Writing…</>
          : <><Sparkles className="h-3 w-3" /> AI complete</>}
      </Button>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <nav className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto flex h-14 items-center justify-between px-6">
          <button onClick={() => navigate("/")} className="flex items-center gap-2.5 text-foreground transition-colors hover:text-primary">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15 ring-1 ring-inset ring-primary/30">
              <BarChart3 className="h-3.5 w-3.5 text-primary" />
            </div>
            <span className="text-[15px] font-medium tracking-tight">Concept AI</span>
          </button>
          <div className="flex items-center gap-2"><ThemeToggle /><UserMenu /></div>
        </div>
      </nav>

      <main id="main-content" className="container mx-auto max-w-2xl px-6 py-10">
        {showBrief && (
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="mb-8 rounded-xl border border-primary/20 bg-accent/40 p-5"
          >
            <div className="mb-2 flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-primary" />
              <h3 className="font-display text-sm font-semibold text-foreground">Start with one sentence — AI fills the rest</h3>
            </div>
            <Textarea
              value={brief} onChange={(e) => setBrief(e.target.value)} rows={2}
              placeholder="e.g., A subscription healthy meals platform for working professionals in Riyadh"
              maxLength={500}
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <button type="button" onClick={() => setShowBrief(false)}
                className="text-xs text-muted-foreground hover:text-foreground">Skip — I'll fill manually</button>
              <Button type="button" onClick={handleAutoFill} disabled={isAutoFilling} size="sm" className="gap-2">
                {isAutoFilling ? <><Loader2 className="h-4 w-4 animate-spin" /> Drafting…</> : <><Sparkles className="h-4 w-4" /> Generate draft</>}
              </Button>
            </div>
          </motion.div>
        )}

        <div className="mb-10">
          <div className="flex items-center justify-between mb-3">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                  i <= step ? "hero-gradient text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}>{i + 1}</div>
                <span className={`hidden text-sm font-medium md:inline ${
                  i <= step ? "text-foreground" : "text-muted-foreground"
                }`}>{s}</span>
              </div>
            ))}
          </div>
          <div className="h-1.5 rounded-full bg-muted">
            <div className="h-full rounded-full hero-gradient transition-all duration-500" style={{ width: `${((step + 1) / 4) * 100}%` }} />
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={step}
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }} className="space-y-6">
            <h2 className="font-display text-2xl font-bold text-foreground">{STEPS[step]}</h2>

            {step === 0 && (
              <>
                <div className="space-y-2">
                  <Label>Project Name *</Label>
                  <Input value={inputs.projectName} onChange={(e) => set("projectName", e.target.value)} placeholder="e.g., Healthy Meals Delivery Platform" maxLength={200} />
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Industry / Sector *</Label>
                    <Select value={inputs.industry} onValueChange={(v) => set("industry", v)}>
                      <SelectTrigger><SelectValue placeholder="Select industry" /></SelectTrigger>
                      <SelectContent>{INDUSTRIES.map((ind) => <SelectItem key={ind} value={ind}>{ind}</SelectItem>)}</SelectContent>
                    </Select>
                    {(() => {
                      const tpl = findTemplate(inputs.industry);
                      if (!tpl) return null;
                      return (
                        <button
                          type="button"
                          onClick={() => { setInputs((p) => applyTemplate(p, tpl)); toast.success(`Applied ${tpl.label} template`); }}
                          className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-primary/25 bg-primary/5 px-2 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10"
                          title={tpl.blurb}
                        >
                          <Sparkles className="h-3 w-3" /> Apply {tpl.label} template
                        </button>
                      );
                    })()}
                  </div>
                  <div className="space-y-2">
                    <Label>Location (City / Country)</Label>
                    <Input value={inputs.location} onChange={(e) => set("location", e.target.value)} placeholder="e.g., Riyadh, Saudi Arabia" maxLength={120} />
                  </div>
                </div>
                <div className="space-y-2">
                  <EssayLabel field="description">Project Description *</EssayLabel>
                  <Textarea value={inputs.description} onChange={(e) => set("description", e.target.value)} placeholder="Describe the project concept, its purpose, and expected outcomes…" rows={4} maxLength={2000} />
                </div>
                <div className="space-y-2">
                  <EssayLabel field="strategicObjectives">Strategic Objectives</EssayLabel>
                  <Textarea value={inputs.strategicObjectives} onChange={(e) => set("strategicObjectives", e.target.value)} placeholder="Key strategic objectives this project aims to achieve…" rows={3} maxLength={1500} />
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Business Model</Label>
                    <Select value={inputs.businessModel} onValueChange={(v) => set("businessModel", v)}>
                      <SelectTrigger><SelectValue placeholder="Select model" /></SelectTrigger>
                      <SelectContent>{BUSINESS_MODELS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Revenue Model</Label>
                    <Select value={inputs.revenueModel} onValueChange={(v) => set("revenueModel", v)}>
                      <SelectTrigger><SelectValue placeholder="Select revenue model" /></SelectTrigger>
                      <SelectContent>{REVENUE_MODELS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <EssayLabel field="founderExperience">Founder / Team Experience</EssayLabel>
                  <Textarea value={inputs.founderExperience} onChange={(e) => set("founderExperience", e.target.value)} placeholder="Years of experience, prior exits, domain expertise…" rows={2} maxLength={1000} />
                </div>
                <div className="space-y-2">
                  <Label>Competitor URLs <span className="text-xs text-muted-foreground">(optional · one per line)</span></Label>
                  <Textarea value={inputs.competitorUrls} onChange={(e) => set("competitorUrls", e.target.value)} placeholder={"https://competitor1.com\nhttps://competitor2.com"} rows={2} maxLength={800} />
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                </div>
                <div className="space-y-2">
                  <Label>Team Size</Label>
                  <Select value={inputs.teamSize} onValueChange={(v) => set("teamSize", v)}>
                    <SelectTrigger><SelectValue placeholder="Select team size" /></SelectTrigger>
                    <SelectContent>{TEAM_SIZES.map((ts) => <SelectItem key={ts} value={ts}>{ts}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <EssayLabel field="dependencies">Key Dependencies</EssayLabel>
                  <Textarea value={inputs.dependencies} onChange={(e) => set("dependencies", e.target.value)} placeholder="Third-party vendors, regulatory approvals, other projects…" rows={3} maxLength={1500} />
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div className="space-y-2">
                  <EssayLabel field="assumptions">Key Assumptions</EssayLabel>
                  <Textarea value={inputs.assumptions} onChange={(e) => set("assumptions", e.target.value)} placeholder="List key assumptions the project is based on…" rows={4} maxLength={1500} />
                </div>
                <div className="space-y-2">
                  <EssayLabel field="constraints">Known Constraints</EssayLabel>
                  <Textarea value={inputs.constraints} onChange={(e) => set("constraints", e.target.value)} placeholder="Budget limits, technology restrictions, team availability…" rows={3} maxLength={1500} />
                </div>
                <div className="space-y-2">
                  <EssayLabel field="successFactors">Critical Success Factors</EssayLabel>
                  <Textarea value={inputs.successFactors} onChange={(e) => set("successFactors", e.target.value)} placeholder="What must go right for this project to succeed?" rows={3} maxLength={1500} />
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <div className="space-y-2">
                  <EssayLabel field="knownRisks">Known Risks</EssayLabel>
                  <Textarea value={inputs.knownRisks} onChange={(e) => set("knownRisks", e.target.value)} placeholder="Describe any known risks, threats, or uncertainties…" rows={4} maxLength={1500} />
                </div>
                <div className="space-y-2">
                  <EssayLabel field="regulatoryConsiderations">Regulatory / Compliance Considerations</EssayLabel>
                  <Textarea value={inputs.regulatoryConsiderations} onChange={(e) => set("regulatoryConsiderations", e.target.value)} placeholder="Relevant regulations, standards, or compliance requirements…" rows={3} maxLength={1500} />
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

        <div className="mt-10 flex items-center justify-between">
          <Button variant="outline" onClick={step === 0 ? () => navigate("/") : prev} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> {step === 0 ? "Home" : "Back"}
          </Button>
          {step < 3 ? (
            <Button onClick={next} className="gap-2">Next <ArrowRight className="h-4 w-4" /></Button>
          ) : (
            <Button onClick={handleSubmit} disabled={isAnalyzing} className="gap-2 px-8">
              {isAnalyzing
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Analyzing…</>
                : <>Run Analysis <ArrowRight className="h-4 w-4" /></>}
            </Button>
          )}
        </div>
      </main>
    </div>
  );
};

export default Analyze;
