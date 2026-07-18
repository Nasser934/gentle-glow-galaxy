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
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  ConceptInputs, FeasibilityReport, INDUSTRIES, BUDGET_RANGES, TIMELINES, TEAM_SIZES, TECHNOLOGY_READINESS,
  BUSINESS_MODELS, REVENUE_MODELS, initialInputs,
} from "@/types/analysis";
import { supabase } from "@/integrations/supabase/client";
import { findTemplate, applyTemplate } from "@/lib/industryTemplates";
import { getReportById, saveReport, saveRerunReport } from "@/lib/reports";
import { assessInputQuality, ensureEvidenceFields, buildVersionEntry } from "@/lib/evidence";
import { INPUT_KEYS, validateConceptInputs, type FieldOrigin } from "@/lib/inputValidation";
import { isInternalConcept } from "@/lib/format";

const STEPS = ["Project Overview", "Scope & Resources", "Assumptions & Constraints", "Risk Inputs"];
const FOCUS_TO_STEP: Record<string, number> = {
  projectName: 0, industry: 0, location: 0, description: 0, strategicObjectives: 0,
  businessModel: 0, revenueModel: 0, founderExperience: 0, competitorUrls: 0,
  budgetRange: 1, timeline: 1, teamSize: 1, dependencies: 1,
  assumptions: 2, constraints: 2, successFactors: 2,
  knownRisks: 3, regulatoryConsiderations: 3, technologyReadiness: 3,
};

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
  const [previousReport, setPreviousReport] = useState<FeasibilityReport | null>(null);
  const [previousInputs, setPreviousInputs] = useState<ConceptInputs | null>(null);
  // Phase 4 hardening: gate the entire re-run flow on ownership + presence of inputs.
  const [rerunBlocked, setRerunBlocked] = useState<null | { reason: "not_owner" | "no_inputs" | "not_found" | "not_signed_in"; message: string }>(null);

  const [brief, setBrief] = useState("");
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [showBrief, setShowBrief] = useState(!isReRun);
  const [completing, setCompleting] = useState<EssayField | null>(null);
  const [fieldOrigins, setFieldOrigins] = useState<Partial<Record<keyof ConceptInputs, FieldOrigin>>>({});
  const [draftSuggestions, setDraftSuggestions] = useState<Partial<ConceptInputs> | null>(null);
  const [selectedSuggestionKeys, setSelectedSuggestionKeys] = useState<Set<keyof ConceptInputs>>(new Set());
  const [fieldSuggestion, setFieldSuggestion] = useState<{ field: EssayField; text: string } | null>(null);
  const [pendingSave, setPendingSave] = useState<{
    report: FeasibilityReport;
    inputs: ConceptInputs;
    mode: "new" | "rerun";
    saveOperationKey: string;
  } | null>(null);
  const [retryingSave, setRetryingSave] = useState(false);

  // Per-field validation errors collected by validateStep(). Cleared on field change.
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof ConceptInputs, string>>>({});

  const set = (field: keyof ConceptInputs, value: string) => {
    setInputs((prev) => ({ ...prev, [field]: value }));
    setFieldOrigins((prev) => ({
      ...prev,
      [field]: prev[field] === "accepted_ai_suggestion"
        || prev[field] === "ai_suggestion"
        || prev[field] === "edited_after_ai_suggestion"
        ? "edited_after_ai_suggestion"
        : "user_input",
    }));
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };


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
        setFieldOrigins((row.output as FeasibilityReport).inputOrigins ?? Object.fromEntries(
          INPUT_KEYS.filter((key) => savedInputs[key]?.trim()).map((key) => [key, "user_input" as const]),
        ));
        setPreviousInputs(savedInputs);
        setPreviousReport(row.output);
        toast.success("Previous inputs loaded. Edit weak fields, then re-run.");
      } catch (error: unknown) {
        setRerunBlocked({ reason: "not_found", message: error instanceof Error ? error.message : "Could not load previous report." });
      } finally {
        if (!cancelled) setLoadingPrevious(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isReRun, reportId]);

  // Map focus field → wizard step, jump there once inputs are loaded.
  useEffect(() => {
    if (!focusField || loadingPrevious) return;
    const target = FOCUS_TO_STEP[focusField];
    if (typeof target === "number") setStep(target);
  }, [focusField, loadingPrevious]);


  // Input quality assessment (live)
  const quality = useMemo(() => assessInputQuality(inputs), [inputs]);
  const internalBrief = isInternalConcept(inputs);
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
      const { data, error } = await supabase.functions.invoke("autofill-brief", {
        body: { brief, idempotencyKey: `autofill-${crypto.randomUUID()}` },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const draft = (data?.draft ?? {}) as Partial<ConceptInputs>;
      const available = INPUT_KEYS.filter((key) => typeof draft[key] === "string" && draft[key]!.trim() && draft[key] !== inputs[key]);
      setDraftSuggestions(draft);
      setSelectedSuggestionKeys(new Set(available.filter((key) => !inputs[key]?.trim())));
      toast.success("Draft suggestions are ready for your review.");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not generate draft.");
    } finally {
      setIsAutoFilling(false);
    }
  };

  const completeField = async (field: EssayField) => {
    setCompleting(field);
    try {
      const { data, error } = await supabase.functions.invoke("complete-field", {
        body: { field, partial: inputs[field], inputs, idempotencyKey: `field-${crypto.randomUUID()}` },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.text) {
        setFieldSuggestion({ field, text: data.text });
        toast.success("AI suggestion ready. Review it before applying.");
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "AI completion failed.");
    } finally {
      setCompleting(null);
    }
  };

  const applyDraftSuggestions = () => {
    if (!draftSuggestions) return;
    setInputs((current) => {
      const next = { ...current };
      for (const key of selectedSuggestionKeys) {
        const suggestion = draftSuggestions[key];
        if (typeof suggestion === "string" && suggestion.trim()) next[key] = suggestion.trim();
      }
      return next;
    });
    setFieldOrigins((current) => ({
      ...current,
      ...Object.fromEntries([...selectedSuggestionKeys].map((key) => [key, "accepted_ai_suggestion" as const])),
    }));
    setFieldErrors({});
    setDraftSuggestions(null);
    setSelectedSuggestionKeys(new Set());
    setShowBrief(false);
    toast.success("Selected AI suggestions applied. You can edit every field before analysis.");
  };

  const acceptFieldSuggestion = () => {
    if (!fieldSuggestion) return;
    const { field, text } = fieldSuggestion;
    setInputs((current) => ({ ...current, [field]: text }));
    setFieldOrigins((current) => ({ ...current, [field]: "accepted_ai_suggestion" }));
    setFieldSuggestion(null);
  };

  const validateStep = () => {
    const errs: Partial<Record<keyof ConceptInputs, string>> = {};
    if (step === 0) {
      if (!inputs.projectName.trim()) errs.projectName = "Project name is required";
      if (!inputs.industry) errs.industry = "Industry is required";
      if (!inputs.description.trim()) errs.description = "Description is required";
    }
    if (step === 1) {
      if (!inputs.budgetRange) errs.budgetRange = "Budget range is required";
      if (!inputs.timeline) errs.timeline = "Timeline is required";
    }
    setFieldErrors(errs);
    const list = Object.values(errs);
    if (list.length > 0) {
      toast.error(`Please complete: ${list.join(", ")}`);
      return false;
    }
    return true;
  };

  const errorClass = (field: keyof ConceptInputs) =>
    fieldErrors[field] ? "border-destructive ring-1 ring-destructive/40" : "";
  const InlineError = ({ field }: { field: keyof ConceptInputs }) =>
    fieldErrors[field] ? (
      <p id={`${field}-error`} className="mt-1 flex items-start gap-1 text-[11px] text-destructive">
        <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
        <span>{fieldErrors[field]}</span>
      </p>
    ) : null;

  const OriginBadge = ({ field }: { field: keyof ConceptInputs }) => {
    const suggestionAvailable = (draftSuggestions && typeof draftSuggestions[field] === "string")
      || fieldSuggestion?.field === field;
    const origin: FieldOrigin | undefined = suggestionAvailable ? "ai_suggestion" : fieldOrigins[field];
    if (!origin) return null;
    const label: Record<FieldOrigin, string> = {
      user_input: "Entered by user",
      ai_suggestion: "Suggested by AI",
      accepted_ai_suggestion: "Accepted AI suggestion",
      edited_after_ai_suggestion: "Edited after AI suggestion",
    };
    return <Badge variant="outline" className="text-[9px] font-normal normal-case">{label[origin]}</Badge>;
  };


  const next = () => { if (validateStep()) setStep((s) => Math.min(s + 1, 3)); };
  const prev = () => setStep((s) => Math.max(s - 1, 0));

  const handleSubmit = async () => {
    if (!validateStep()) return;
    const validated = validateConceptInputs(inputs);
    if (!validated.success) {
      const nextErrors: Partial<Record<keyof ConceptInputs, string>> = {};
      let firstStep = step;
      for (const issue of validated.issues) {
        if (!issue.field || !INPUT_KEYS.includes(issue.field as typeof INPUT_KEYS[number])) continue;
        const field = issue.field as keyof ConceptInputs;
        nextErrors[field] ??= issue.message;
        firstStep = Math.min(firstStep, FOCUS_TO_STEP[field] ?? step);
      }
      setFieldErrors(nextErrors);
      setStep(firstStep);
      toast.error("Correct the highlighted brief fields before analysis.");
      return;
    }
    setIsAnalyzing(true);
    try {
      const analyzedInputs = structuredClone(inputs);
      const idempotencyKey = `analysis-${crypto.randomUUID()}`;
      const { data, error } = await supabase.functions.invoke("analyze-concept", {
        body: { inputs: analyzedInputs, inputOrigins: fieldOrigins, idempotencyKey },
      });
      if (error) {
        let detail = error.message;
        try {
          const ctx = (error as { context?: { json?: () => Promise<{ error?: string }>; text?: () => Promise<string> } }).context;
          if (ctx?.json) { const parsed = await ctx.json(); if (parsed.error) detail = parsed.error; }
          else if (ctx?.text) { const text = await ctx.text(); if (text) detail = text; }
        } catch (_) { /* ignore */ }
        throw new Error(detail);
      }
      if (data?.error) throw new Error(data.error);

      // Enrich with evidence layer
      let enriched = ensureEvidenceFields(data, analyzedInputs);
      const saveOperationKey = crypto.randomUUID();

      // If this is a re-run, carry version history forward, append diff, save linked row.
      if (isReRun && previousReport && previousInputs) {
        const prevEnriched = ensureEvidenceFields(previousReport, previousInputs);
        const versionEntry = buildVersionEntry(prevEnriched, enriched, previousInputs, analyzedInputs);
        const history = Array.isArray(previousReport.reportVersions) ? previousReport.reportVersions : [];
        enriched = { ...enriched, reportVersions: [...history, versionEntry] };
        try {
          const saved = await saveRerunReport({ parentReportId: reportId, inputs: analyzedInputs, report: enriched, saveOperationKey });
          navigate(`/reports/${saved.id}`, { state: { report: saved.report, inputs: analyzedInputs, slug: saved.slug, reportId: saved.id } });
          return;
        } catch (saveErr) {
          console.error("saveRerunReport failed", saveErr);
          setPendingSave({ report: enriched, inputs: analyzedInputs, mode: "rerun", saveOperationKey });
          const detail = saveErr instanceof Error ? saveErr.message : String(saveErr);
          toast.error(`Analysis completed, but the new version was not saved: ${detail}. Retry saving without running AI again.`);
          return;
        }
      }

      // First-time analysis: save first, then navigate to the canonical owner
      // workspace. This prevents Results.tsx from auto-saving a duplicate row.
      try {
        const saved = await saveReport(analyzedInputs, enriched, saveOperationKey);
        navigate(`/reports/${saved.id}`, { state: { report: saved.report, inputs: analyzedInputs, slug: saved.slug, reportId: saved.id } });
        return;
      } catch (saveErr) {
        console.error("saveReport failed", saveErr);
        setPendingSave({ report: enriched, inputs: analyzedInputs, mode: "new", saveOperationKey });
        const detail = saveErr instanceof Error ? saveErr.message : String(saveErr);
        toast.error(`Analysis completed, but the report was not saved: ${detail}. Retry saving without running AI again.`);
        return;
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Analysis failed.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const retryPendingSave = async () => {
    if (!pendingSave) return;
    setRetryingSave(true);
    try {
      const saved = pendingSave.mode === "rerun"
        ? await saveRerunReport({ parentReportId: reportId, inputs: pendingSave.inputs, report: pendingSave.report, saveOperationKey: pendingSave.saveOperationKey })
        : await saveReport(pendingSave.inputs, pendingSave.report, pendingSave.saveOperationKey);
      setPendingSave(null);
      navigate(`/reports/${saved.id}`, { state: { report: saved.report, inputs: pendingSave.inputs, slug: saved.slug, reportId: saved.id } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save retry failed");
    } finally {
      setRetryingSave(false);
    }
  };



  const EssayLabel = ({ field, children }: { field: EssayField; children: React.ReactNode }) => (
    <div className="flex items-center justify-between">
      <div className="flex flex-wrap items-center gap-2"><Label>{children}</Label><OriginBadge field={field} /></div>
      <Button
        type="button" variant="ghost" size="sm" className="h-7 gap-1 text-xs text-primary hover:bg-accent"
        onClick={() => completeField(field)} disabled={completing === field}
        aria-label={`AI complete ${typeof children === "string" ? children : field}`}
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

      <Dialog open={!!draftSuggestions} onOpenChange={(open) => !open && setDraftSuggestions(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review AI draft suggestions</DialogTitle>
            <DialogDescription>
              Nothing is applied automatically. Empty fields are selected by default; existing user text remains protected unless you explicitly select its replacement.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {draftSuggestions && INPUT_KEYS.flatMap((key) => {
              const suggestion = draftSuggestions[key];
              if (typeof suggestion !== "string" || !suggestion.trim() || suggestion === inputs[key]) return [];
              const checked = selectedSuggestionKeys.has(key);
              return [(
                <label key={key} className="flex cursor-pointer gap-3 rounded-md border border-border p-3">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(value) => setSelectedSuggestionKeys((current) => {
                      const next = new Set(current);
                      if (value === true) next.add(key); else next.delete(key);
                      return next;
                    })}
                    aria-label={`Accept AI suggestion for ${key}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{key}</span>
                      <Badge variant="outline" className="text-[9px] normal-case">Suggested by AI</Badge>
                      {inputs[key]?.trim() && <Badge variant="outline" className="text-[9px] normal-case">Will replace user text</Badge>}
                    </div>
                    {inputs[key]?.trim() && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">Current: {inputs[key]}</p>}
                    <p className="mt-1 text-sm text-foreground">Suggestion: {suggestion}</p>
                  </div>
                </label>
              )];
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraftSuggestions(null)}>Keep current fields</Button>
            <Button onClick={applyDraftSuggestions} disabled={selectedSuggestionKeys.size === 0}>Apply selected suggestions</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!fieldSuggestion} onOpenChange={(open) => !open && setFieldSuggestion(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review field suggestion</DialogTitle>
            <DialogDescription>
              The AI suggestion will replace this field only after you accept it. You can edit it afterward.
            </DialogDescription>
          </DialogHeader>
          {fieldSuggestion && (
            <div className="space-y-3">
              {inputs[fieldSuggestion.field]?.trim() && (
                <div className="rounded-md border border-border p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Current user text</div>
                  <p className="mt-1 text-sm">{inputs[fieldSuggestion.field]}</p>
                </div>
              )}
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-primary">Suggested by AI</div>
                <p className="mt-1 text-sm">{fieldSuggestion.text}</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFieldSuggestion(null)}>Keep current text</Button>
            <Button onClick={acceptFieldSuggestion}>Accept suggestion</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>



      <div className="container mx-auto max-w-2xl px-6 py-10">
        {pendingSave && (
          <div className="mb-6 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-semibold text-foreground">Analysis ready — save still required</div>
                <p className="mt-1 text-xs text-muted-foreground">Retrying here saves the validated result without making another AI request.</p>
              </div>
              <Button onClick={retryPendingSave} disabled={retryingSave} className="gap-2">
                {retryingSave && <Loader2 className="h-4 w-4 animate-spin" />} Retry save
              </Button>
            </div>
          </div>
        )}
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
                    Editing field: {quality.fields.find((field) => String(field.key) === focusField)?.label || focusField}
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
                <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors ring-1 ${
                  i <= step
                    ? "bg-primary text-primary-foreground ring-primary shadow-sm"
                    : "bg-background text-foreground ring-border"
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
                  <div className="flex flex-wrap items-center gap-2"><Label>Project Name *</Label><OriginBadge field="projectName" /></div>
                  <Input value={inputs.projectName} onChange={(e) => set("projectName", e.target.value)} placeholder="e.g., Healthy Meals Delivery Platform" maxLength={200} className={errorClass("projectName")} aria-invalid={!!fieldErrors.projectName} />
                  <InlineError field="projectName" />
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2"><Label>Industry / Sector *</Label><OriginBadge field="industry" /></div>
                    <Select value={inputs.industry} onValueChange={(v) => set("industry", v)}>
                      <SelectTrigger className={errorClass("industry")} aria-invalid={!!fieldErrors.industry}><SelectValue placeholder="Select industry" /></SelectTrigger>
                      <SelectContent>{INDUSTRIES.map((ind) => <SelectItem key={ind} value={ind}>{ind}</SelectItem>)}</SelectContent>
                    </Select>
                    <InlineError field="industry" />

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
                    <div className="flex flex-wrap items-center gap-2"><Label>Location (City / Country)</Label><OriginBadge field="location" /></div>
                    <Input value={inputs.location} onChange={(e) => set("location", e.target.value)} placeholder="e.g., Riyadh, Saudi Arabia" maxLength={120} />
                  </div>
                </div>
                <div className="space-y-2">
                  <EssayLabel field="description">Project Description *</EssayLabel>
                  <Textarea value={inputs.description} onChange={(e) => set("description", e.target.value)} placeholder="Describe the project concept, its purpose, and expected outcomes…" rows={4} maxLength={2000} className={errorClass("description")} aria-invalid={!!fieldErrors.description} />
                  <InlineError field="description" />
                </div>

                <div className="space-y-2">
                  <EssayLabel field="strategicObjectives">Strategic Objectives</EssayLabel>
                  <Textarea value={inputs.strategicObjectives} onChange={(e) => set("strategicObjectives", e.target.value)} placeholder="Key strategic objectives this project aims to achieve…" rows={3} maxLength={1500} />
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2"><Label>Business Model</Label><OriginBadge field="businessModel" /></div>
                    <Select value={inputs.businessModel} onValueChange={(v) => set("businessModel", v)}>
                      <SelectTrigger><SelectValue placeholder="Select model" /></SelectTrigger>
                      <SelectContent>{BUSINESS_MODELS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2"><Label>{internalBrief ? "Internal Value Model" : "Revenue Model"}</Label><OriginBadge field="revenueModel" /></div>
                    <Select value={inputs.revenueModel} onValueChange={(v) => set("revenueModel", v)}>
                      <SelectTrigger><SelectValue placeholder={internalBrief ? "Select internal value model" : "Select revenue model"} /></SelectTrigger>
                      <SelectContent>{REVENUE_MODELS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <EssayLabel field="founderExperience">Founder / Team Experience</EssayLabel>
                  <Textarea value={inputs.founderExperience} onChange={(e) => set("founderExperience", e.target.value)} placeholder="Years of experience, prior exits, domain expertise…" rows={2} maxLength={1000} />
                </div>
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2"><Label>Competitor URLs <span className="text-xs text-muted-foreground">(optional · one per line)</span></Label><OriginBadge field="competitorUrls" /></div>
                  <Textarea value={inputs.competitorUrls} onChange={(e) => set("competitorUrls", e.target.value)} placeholder={"https://competitor1.com\nhttps://competitor2.com"} rows={2} maxLength={800} className={errorClass("competitorUrls")} aria-invalid={!!fieldErrors.competitorUrls} />
                  <InlineError field="competitorUrls" />
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2"><Label>Estimated Budget Range *</Label><OriginBadge field="budgetRange" /></div>
                    <Select value={inputs.budgetRange} onValueChange={(v) => set("budgetRange", v)}>
                      <SelectTrigger className={errorClass("budgetRange")} aria-invalid={!!fieldErrors.budgetRange}><SelectValue placeholder="Select budget range" /></SelectTrigger>
                      <SelectContent>{BUDGET_RANGES.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                    </Select>
                    <InlineError field="budgetRange" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2"><Label>Expected Timeline *</Label><OriginBadge field="timeline" /></div>
                    <Select value={inputs.timeline} onValueChange={(v) => set("timeline", v)}>
                      <SelectTrigger className={errorClass("timeline")} aria-invalid={!!fieldErrors.timeline}><SelectValue placeholder="Select timeline" /></SelectTrigger>
                      <SelectContent>{TIMELINES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                    <InlineError field="timeline" />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2"><Label>Team Size</Label><OriginBadge field="teamSize" /></div>
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
                  <div className="flex flex-wrap items-center gap-2"><Label>Technology Readiness</Label><OriginBadge field="technologyReadiness" /></div>
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
