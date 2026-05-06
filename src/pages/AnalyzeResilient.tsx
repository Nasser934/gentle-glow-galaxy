import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, BarChart3, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { generateLocalReport } from "@/lib/localReport";
import { BUDGET_RANGES, ConceptInputs, INDUSTRIES, TIMELINES, initialInputs } from "@/types/analysis";

const fn = "analyze-concept-v2";
const options = (items: readonly string[]) => items.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>);
const err = (e: unknown) => e instanceof Error ? e.message : "Edge function unavailable";

export default function AnalyzeResilient() {
  const nav = useNavigate();
  const [inputs, setInputs] = useState<ConceptInputs>(initialInputs);
  const [loading, setLoading] = useState(false);
  const set = (k: keyof ConceptInputs, v: string) => setInputs((p) => ({ ...p, [k]: v }));
  const run = async () => {
    if (!inputs.projectName || !inputs.industry || !inputs.description || !inputs.budgetRange || !inputs.timeline) {
      toast.error("Fill project name, industry, description, budget, and timeline.");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(fn, { body: { inputs } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      nav("/results", { state: { report: data, inputs } });
    } catch (e) {
      console.error(e);
      const report = generateLocalReport(inputs);
      toast.warning(`Edge analysis unavailable. Local draft generated. ${err(e)}`);
      nav("/results", { state: { report, inputs } });
    } finally {
      setLoading(false);
    }
  };
  return <div className="min-h-screen bg-background px-6 py-8">
    <div className="mx-auto max-w-2xl space-y-6">
      <button onClick={() => nav("/")} className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-primary" /><span className="font-semibold">Concept AI</span></button>
      <h1 className="font-display text-3xl font-bold">New Feasibility Analysis</h1>
      <div className="space-y-2"><Label>Project Name</Label><Input value={inputs.projectName} onChange={(e) => set("projectName", e.target.value)} /></div>
      <div className="space-y-2"><Label>Industry</Label><Select value={inputs.industry} onValueChange={(v) => set("industry", v)}><SelectTrigger><SelectValue placeholder="Select industry" /></SelectTrigger><SelectContent>{options(INDUSTRIES)}</SelectContent></Select></div>
      <div className="space-y-2"><Label>Location</Label><Input value={inputs.location} onChange={(e) => set("location", e.target.value)} /></div>
      <div className="space-y-2"><Label>Description</Label><Textarea rows={5} value={inputs.description} onChange={(e) => set("description", e.target.value)} /></div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2"><Label>Budget</Label><Select value={inputs.budgetRange} onValueChange={(v) => set("budgetRange", v)}><SelectTrigger><SelectValue placeholder="Select budget" /></SelectTrigger><SelectContent>{options(BUDGET_RANGES)}</SelectContent></Select></div>
        <div className="space-y-2"><Label>Timeline</Label><Select value={inputs.timeline} onValueChange={(v) => set("timeline", v)}><SelectTrigger><SelectValue placeholder="Select timeline" /></SelectTrigger><SelectContent>{options(TIMELINES)}</SelectContent></Select></div>
      </div>
      <div className="space-y-2"><Label>Known Risks</Label><Textarea rows={3} value={inputs.knownRisks} onChange={(e) => set("knownRisks", e.target.value)} /></div>
      <div className="space-y-2"><Label>Regulatory / Compliance</Label><Textarea rows={3} value={inputs.regulatoryConsiderations} onChange={(e) => set("regulatoryConsiderations", e.target.value)} /></div>
      <Button onClick={run} disabled={loading} className="w-full gap-2">{loading ? <><Loader2 className="h-4 w-4 animate-spin" />Analyzing</> : <>Run Analysis<ArrowRight className="h-4 w-4" /></>}</Button>
    </div>
  </div>;
}
