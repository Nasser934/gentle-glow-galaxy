import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, BarChart3, Loader2, Sparkles, Wand2, RefreshCw, AlertCircle } from "lucide-react";
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
import { getReportById, saveReport, saveRerunReport } from "@/lib/reports";
import { assessInputQuality, ensureEvidenceFields, buildVersionEntry } from "@/lib/evidence";

const STEPS = ["Project Overview", "Scope & Resources", "Assumptions & Constraints", "Risk Inputs"];

type EssayField =
  | "description" | "strategicObjectives" | "dependencies"
  | "assumptions" | "constraints" | "successFactors"
  | "knownRisks" | "regulatoryConsiderations" | "founderExperience";

const Analyze = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const reportId = params.get("reportId") || "";
  const focusField = params.get("focus") || "";
  const isReRun = !!reportId;

  const [step, setStep] = useState(0);
  const [inputs, setInputs] = useState<ConceptInputs>(initialInputs);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [loadingPrevious, setLoadingPrevious] = useState(isReRun);
  const [previousReport, setPreviousReport] = useState<any>(null);
  const [previousInputs, setPreviousInputs] = useState<ConceptInputs | null>(null);
  // Phase 4 hardening: gate the entire re-run flow on ownership + presence of inputs.
  const [rerunBlocked, setRerunBlocked] = useState<null | { reason: "not_owner" | "no_inputs" | "not_found" | "not_signed_in"; message: string }>(null);

  const [brief, setBrief] = useState("");
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [showBrief, setShowBrief] = useState(!isReRun);
  const [completing, setCompleting] = useState<EssayField | null>(null);

  const set = (field: keyof ConceptInputs, value: string) =>
    setInputs((prev) => ({ ...prev, [field]: value }));

  // Pre-fill from previous report when ?reportId= is present — owner only.
  useEffect(() => {
    if (!isReRun) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setRerunBlocked({ reason: "not_signed_in", message: "Sign in to improve this report." });
          return;
        }
        const row = await getReportById(reportId);
        if (cancelled) return;
        if (!row) {
          setRerunBlocked({ reason: "not_found", message: "Previous report not found." });
          return;
        }
        if (row.user_id !== user.id) {
          // Non-owner: do NOT pre-fill, do NOT allow re-run, even if the row is public/shared.
          setRerunBlocked({
            reason: "not_owner",
            message: "You can view this report, but only the owner can improve its inputs.",
          });
          return;
        }
        const savedInputs = row.inputs as ConceptInputs | null;
        const hasUsableInputs = savedInputs && typeof savedInputs === "object"
          && (savedInputs.projectName?.trim() || savedInputs.description?.trim());
        if (!hasUsableInputs) {
          setRerunBlocked({
            reason: "no_inputs",
            message: "Original inputs are not available for this report. Create a new analysis to use the improvement flow.",
          });
          return;
        }
        setInputs(savedInputs);
        setPreviousInputs(savedInputs);
        setPreviousReport(row.output);
        toast.success("Previous inputs loaded. Edit weak fields, then re-run.");
      } catch (e: any) {
        setRerunBlocked({ reason: "not_found", message: e?.message || "Could not load previous report." });
      } finally {
        if (!cancelled) setLoadingPrevious(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isReRun, reportId]);

  // Map focus field → wizard step, jump there once inputs are loaded.
  const FOCUS_TO_STEP: Record<string, number> = {
    projectName: 0, industry: 0, location: 0, description: 0, strategicObjectives: 0,
    businessModel: 0, revenueModel: 0, founderExperience: 0, competitorUrls: 0,
    budgetRange: 1, timeline: 1, teamSize: 1, dependencies: 1,
    assumptions: 2, constraints: 2, successFactors: 2,
    knownRisks: 3, regulatoryConsiderations: 3, technologyReadiness: 3,
  };
  useEffect(() => {
    if (!focusField || loadingPrevious) return;
    const target = FOCUS_TO_STEP[focusField];
    if (typeof target === "number") setStep(target);
  }, [focusField, loadingPrevious]);


  // Input quality assessment (live)
  const quality = useMemo(() => assessInputQuality(inputs), [inputs]);
  const weakKeys = useMemo(
    () => new Set(quality.fields.filter((f) => f.status === "missing" || f.status === "weak" || f.status === "needs_improvement").map((f) => f.key)),
    [quality],
  );
  const suggestions: Record<string, string> = useMemo(() => {
    const m: Record<string, string> = {};
    for (const f of quality.fields) if (weakKeys.has(f.key)) m[f.key as string] = f.suggestion;
    return m;
  }, [quality, weakKeys]);

  const fieldHint = (key: keyof ConceptInputs) =>
    isReRun && weakKeys.has(key) ? (
      <p className="mt-1 flex items-start gap-1 text-[11px] text-warning">
        <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
        <span>{suggestions[key as string]}</span>
      </p>
    ) : null;

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
    } catch (e: any) {
      toast.error(e?.message || "Could not generate draft.");
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
    } catch (e: any) {
      toast.error(e?.message || "AI completion failed.");
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
      const { data, error } = await supabase.functions.invoke("analyze-concept", { body: { inputs } });
      if (error) {
        let detail = error.message;
        try {
          const ctx: any = (error as any).context;
          if (ctx?.json) { const j = await ctx.json(); if (j?.error) detail = j.error; }
          else if (ctx?.text) { const t = await ctx.text(); if (t) detail = t; }
        } catch (_) { /* ignore */ }
        throw new Error(detail);
      }
      if (data?.error) throw new Error(data.error);

      // Enrich with evidence layer
      let enriched = ensureEvidenceFields(data, inputs);

      // If this is a re-run, carry version history forward, append diff, save linked row.
      if (isReRun && previousReport && previousInputs) {
        const prevEnriched = ensureEvidenceFields(previousReport, previousInputs);
        const versionEntry = buildVersionEntry(prevEnriched, enriched, previousInputs, inputs);
        const history = Array.isArray(previousReport.reportVersions) ? previousReport.reportVersions : [];
        enriched = { ...enriched, reportVersions: [...history, versionEntry] };
        try {
          const saved = await saveRerunReport({ parentReportId: reportId, inputs, report: enriched });
          navigate(`/reports/${saved.id}`, { state: { report: enriched, inputs, slug: saved.slug, reportId: saved.id } });
          return;
        } catch (e) {
          console.warn("Save new version failed", e);
          // fall through — still navigate so user sees results
        }
      }

      // First-time analysis: save first, then navigate to the canonical owner
      // workspace. This prevents Results.tsx from auto-saving a duplicate row.
      try {
        const saved = await saveReport(inputs, enriched);
        navigate(`/reports/${saved.id}`, { state: { report: enriched, inputs, slug: saved.slug, reportId: saved.id } });
        return;
      } catch (e) {
        console.warn("Initial save failed; falling back to /results", e);
      }
      navigate("/results", { state: { report: enriched, inputs } });
    } catch (e: any) {
      toast.error(e?.message || "Analysis failed.");
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

  // Phase 4 hardening: render a safe blocked view instead of the wizard.
  if (isReRun && rerunBlocked) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto max-w-xl px-6 py-16">
          <div className="rounded-xl border border-warning/40 bg-warning/10 p-6 text-sm">
            <div className="mb-2 flex items-center gap-2 font-semibold text-foreground">
              <AlertCircle className="h-4 w-4 text-warning" />
              {rerunBlocked.reason === "not_owner" ? "Read-only report" : "Cannot improve this report"}
            </div>
            <p className="text-muted-foreground">{rerunBlocked.message}</p>
            <div className="mt-4 flex gap-2">
              <Button size="sm" onClick={() => navigate("/analyze")}>Start a new analysis</Button>
              <Button size="sm" variant="outline" onClick={() => navigate("/dashboard")}>Back to dashboard</Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">



      <div className="container mx-auto max-w-2xl px-6 py-10">
        {isReRun && (
          <div className="mb-6 rounded-xl border border-warning/40 bg-warning/10 p-4">
            <div className="flex items-start gap-2 text-sm">
              <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <div>
                <div className="font-semibold text-foreground">Improving report inputs</div>
                <p className="text-xs text-muted-foreground">
                  {loadingPrevious
                    ? "Loading previous inputs…"
                    : `Previous inputs are loaded. ${quality.missing.length + quality.weak.length} field(s) need detail. Edit them and re-run — a new version will be created.`}
                </p>
                {focusField && !loadingPrevious && (
                  <p className="mt-1 text-xs font-medium text-warning">
                    Editing field: {quality.fields.find((f) => f.key === (focusField as any))?.label || focusField}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Brief auto-fill */}
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

        {/* Progress */}
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
                : isReRun
                  ? <><RefreshCw className="h-4 w-4" /> Re-run analysis</>
                  : <>Run Analysis <ArrowRight className="h-4 w-4" /></>}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Analyze;
