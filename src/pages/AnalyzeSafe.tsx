import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, BarChart3, Loader2, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UserMenu } from "@/components/UserMenu";
import { consumerValidationNote } from "@/lib/consumerSafety";
import { findTemplate, applyTemplate } from "@/lib/industryTemplates";
import { generateLocalReport } from "@/lib/localReport";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ConceptInputs } from "@/types/analysis";
import {
  BUDGET_RANGES,
  BUSINESS_MODELS,
  INDUSTRIES,
  REVENUE_MODELS,
  TECHNOLOGY_READINESS,
  TEAM_SIZES,
  TIMELINES,
  initialInputs,
} from "@/types/analysis";

const ANALYSIS_FUNCTION = "analyze-concept-v2" as const;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

type EssayField =
  | "description" | "strategicObjectives" | "dependencies"
  | "assumptions" | "constraints" | "successFactors"
  | "knownRisks" | "regulatoryConsiderations" | "founderExperience";

const messageFromError = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

async function invokeAnalysisViaRest(inputs: ConceptInputs) {
  if (!isSupabaseConfigured || !SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) throw new Error("Analysis service is not configured.");
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Please sign in again before running analysis.");

  const response = await fetch(`${SUPABASE_URL}/functions/v1/${ANALYSIS_FUNCTION}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
    body: JSON.stringify({ inputs }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || "Analysis service is temporarily unavailable.");
  return body;
}

async function invokeAnalysis(inputs: ConceptInputs) {
  const { data, error } = await supabase.functions.invoke(ANALYSIS_FUNCTION, { body: { inputs } });
  if (!error && !data?.error) return data;
  return invokeAnalysisViaRest(inputs);
}

const SelectField = ({ label, value, onValueChange, options, placeholder }: { label: string; value: string; onValueChange: (value: string) => void; options: readonly string[]; placeholder: string }) => (
  <div className="space-y-2">
    <Label>{label}</Label>
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>{options.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
    </Select>
  </div>
);

export default function AnalyzeSafe() {
  const navigate = useNavigate();
  const [inputs, setInputs] = useState<ConceptInputs>(initialInputs);
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [completing, setCompleting] = useState<EssayField | null>(null);

  const set = (field: keyof ConceptInputs, value: string) => setInputs((prev) => ({ ...prev, [field]: value }));

  const validate = () => {
    if (!inputs.projectName.trim()) { toast.error("Project name is required."); return false; }
    if (!inputs.industry) { toast.error("Industry is required."); return false; }
    if (!inputs.description.trim()) { toast.error("Project description is required."); return false; }
    if (!inputs.budgetRange) { toast.error("Budget range is required."); return false; }
    if (!inputs.timeline) { toast.error("Timeline is required."); return false; }
    return true;
  };

  const handleAutoFill = async () => {
    if (brief.trim().length < 10) { toast.error("Add a short idea description first."); return; }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("autofill-brief", { body: { brief } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setInputs({ ...initialInputs, ...data.draft });
      toast.success("Draft generated. Review it before analysis.");
    } catch (error) {
      console.error(error);
      toast.error("Could not generate the draft. You can continue manually.");
    } finally {
      setBusy(false);
    }
  };

  const completeField = async (field: EssayField) => {
    setCompleting(field);
    try {
      const { data, error } = await supabase.functions.invoke("complete-field", { body: { field, partial: inputs[field], inputs } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.text) set(field, data.text);
      toast.success("Field completed.");
    } catch (error) {
      console.error(error);
      toast.error("Could not complete the field. You can continue manually.");
    } finally {
      setCompleting(null);
    }
  };

  const runAnalysis = async () => {
    if (!validate()) return;
    setBusy(true);
    try {
      const report = await invokeAnalysis(inputs);
      navigate("/results", { state: { report, inputs } });
    } catch (error) {
      console.error("Analysis service returned a recoverable issue", messageFromError(error, "unknown"));
      const report = generateLocalReport(inputs);
      toast.warning(`The report is ready with validation assumptions. ${consumerValidationNote}`);
      navigate("/results", { state: { report, inputs } });
    } finally {
      setBusy(false);
    }
  };

  const Essay = ({ field, label, rows = 3, placeholder }: { field: EssayField; label: string; rows?: number; placeholder: string }) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label>{label}</Label>
        <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-xs text-primary" onClick={() => completeField(field)} disabled={completing === field}>
          {completing === field ? <><Loader2 className="h-3 w-3 animate-spin" /> Writing…</> : <><Sparkles className="h-3 w-3" /> AI complete</>}
        </Button>
      </div>
      <Textarea value={inputs[field]} onChange={(e) => set(field, e.target.value)} rows={rows} placeholder={placeholder} maxLength={2500} />
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto flex h-14 items-center justify-between px-6">
          <button onClick={() => navigate("/")} className="flex items-center gap-2.5 text-foreground hover:text-primary">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15"><BarChart3 className="h-4 w-4 text-primary" /></span>
            <span className="font-medium">Concept AI</span>
          </button>
          <div className="flex items-center gap-2"><ThemeToggle /><UserMenu /></div>
        </div>
      </nav>

      <main id="main-content" className="container mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold">Analyze a business concept</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Generate a feasibility study with a project score, recommendation, financials, risks, roadmap, and exportable report.</p>
        </div>

        <Card className="mb-6 border-primary/20">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Wand2 className="h-4 w-4 text-primary" /> Start with one sentence</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={2} placeholder="Example: A subscription healthy meals platform for working professionals in Riyadh" maxLength={500} />
            <Button type="button" onClick={handleAutoFill} disabled={busy} className="gap-2">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Generate draft</Button>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card><CardHeader><CardTitle>1. Project overview</CardTitle></CardHeader><CardContent className="space-y-4">
            <div className="space-y-2"><Label>Project name *</Label><Input value={inputs.projectName} onChange={(e) => set("projectName", e.target.value)} placeholder="Example: Enterprise Data Insights Platform" maxLength={200} /></div>
            <div className="grid gap-4 md:grid-cols-2">
              <SelectField label="Industry *" value={inputs.industry} onValueChange={(v) => set("industry", v)} options={INDUSTRIES} placeholder="Select industry" />
              <div className="space-y-2"><Label>Location</Label><Input value={inputs.location} onChange={(e) => set("location", e.target.value)} placeholder="Riyadh, Saudi Arabia" maxLength={120} /></div>
            </div>
            {findTemplate(inputs.industry) && <Button type="button" variant="outline" size="sm" onClick={() => { const tpl = findTemplate(inputs.industry); if (tpl) setInputs((prev) => applyTemplate(prev, tpl)); toast.success("Template applied."); }}>Apply industry template</Button>}
            <Essay field="description" label="Project description *" rows={5} placeholder="Explain the product, customer, problem, and business model." />
            <Essay field="strategicObjectives" label="Strategic objectives" placeholder="What outcomes should this project achieve?" />
            <Essay field="founderExperience" label="Founder / team experience" rows={2} placeholder="Relevant domain, product, sales, or delivery experience." />
          </CardContent></Card>

          <Card><CardHeader><CardTitle>2. Business and resources</CardTitle></CardHeader><CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <SelectField label="Business model" value={inputs.businessModel} onValueChange={(v) => set("businessModel", v)} options={BUSINESS_MODELS} placeholder="Select model" />
              <SelectField label="Revenue model" value={inputs.revenueModel} onValueChange={(v) => set("revenueModel", v)} options={REVENUE_MODELS} placeholder="Select model" />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <SelectField label="Budget range *" value={inputs.budgetRange} onValueChange={(v) => set("budgetRange", v)} options={BUDGET_RANGES} placeholder="Select budget" />
              <SelectField label="Timeline *" value={inputs.timeline} onValueChange={(v) => set("timeline", v)} options={TIMELINES} placeholder="Select timeline" />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <SelectField label="Team size" value={inputs.teamSize} onValueChange={(v) => set("teamSize", v)} options={TEAM_SIZES} placeholder="Select team size" />
              <SelectField label="Technology readiness" value={inputs.technologyReadiness} onValueChange={(v) => set("technologyReadiness", v)} options={TECHNOLOGY_READINESS} placeholder="Select readiness" />
            </div>
            <Essay field="dependencies" label="Key dependencies" placeholder="Systems, vendors, approvals, integrations, partners." />
            <Essay field="assumptions" label="Key assumptions" placeholder="List the assumptions behind cost, demand, timing, and execution." />
          </CardContent></Card>

          <Card><CardHeader><CardTitle>3. Risks and controls</CardTitle></CardHeader><CardContent className="space-y-4">
            <Essay field="constraints" label="Known constraints" placeholder="Budget, capacity, technology, procurement, or timing limits." />
            <Essay field="successFactors" label="Success factors" placeholder="What must be true for the project to succeed?" />
            <Essay field="knownRisks" label="Known risks" rows={4} placeholder="Main financial, market, operational, compliance, or technology risks." />
            <Essay field="regulatoryConsiderations" label="Regulatory / compliance considerations" placeholder="Relevant regulations, security standards, privacy, sector controls." />
          </CardContent></Card>

          <Card><CardHeader><CardTitle>4. Competitive input</CardTitle></CardHeader><CardContent className="space-y-4">
            <div className="space-y-2"><Label>Competitor URLs or names</Label><Textarea value={inputs.competitorUrls} onChange={(e) => set("competitorUrls", e.target.value)} rows={5} placeholder={"https://competitor1.com\nCompetitor 2"} maxLength={1200} /></div>
            <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">The customer report will show feasibility insight and validation needs only. System diagnostics stay internal.</div>
            <div className="flex justify-between gap-3 pt-2">
              <Button variant="outline" onClick={() => navigate("/")} className="gap-2"><ArrowLeft className="h-4 w-4" />Home</Button>
              <Button onClick={runAnalysis} disabled={busy} className="gap-2 px-8">{busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Analyzing…</> : <>Run analysis <ArrowRight className="h-4 w-4" /></>}</Button>
            </div>
          </CardContent></Card>
        </div>
      </main>
    </div>
  );
}
