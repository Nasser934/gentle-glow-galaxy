// Durable analysis worker. Claims one job through a database lease and runs a
// single stage (or one persisted report part) per invocation.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { ensureEvidenceFields, deepSanitize, buildVersionEntry } from "../_shared/evidence.ts";
import { kimiStructured, KimiError, KIMI_MODEL } from "../_shared/kimi.ts";
import {
  createInitialResearchState,
  ensureResearchSourceIds,
  planResearchQueries,
  runSearchBatch,
  mergeResearchSources,
  selectExtractionBatch,
  extractSourceBatch,
  applyExtractedSources,
  computeResearchQuality,
  reviewResearch,
  shouldContinueResearch,
  buildPublicResearch,
  researchBudgetExhausted,
  countExtractedSources,
  SEARCH_BATCH_SIZE,
  MIN_UNIQUE_SOURCES,
  MAX_TOTAL_QUERIES,
  MAX_RESEARCH_ROUNDS,
  type ResearchState,
} from "../_shared/researchAgent.ts";
import {
  conceptIsSpecificEnough,
  resolveConcept,
} from "../_shared/conceptResolver.ts";
import {
  CONCEPT_AI_POLICY_VERSION,
  PROMPT_BUNDLE_HASH,
  PROMPT_BUNDLE_VERSION,
} from "../_shared/ai/promptManifest.ts";
import type { ResolvedConcept } from "../_shared/ai/schemas/resolved-concept.schema.ts";
import {
  persistReportResearchSnapshot,
  supabaseResearchPersistenceStore,
} from "../_shared/researchPersistence.ts";
import {
  REPORT_PARTS,
  buildPartPrompts,
  mergeReportParts,
  validateMergedReport,
  buildBaseReport,
  finalizeReportDeterministically,
  validateGeneratedPart,
} from "../_shared/analysisCore.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-worker-secret",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const MAX_STAGE_ATTEMPTS = 3;
const LEASE_SECONDS = 180;
const KIMI_TIMEOUT_MS = 110_000;
const REPORT_SCHEMA_VERSION = "feasibility-report.v1";
const conceptResolverEnabled = () =>
  Deno.env.get("CONCEPT_RESOLVER_ENABLED") !== "false";

function sourceSnapshotMetadata(
  job: any,
  researchPersistenceStatus: "pending" | "completed",
): Record<string, unknown> {
  const state = job.research_state as ResearchState | null;
  const quality = job.research_quality as Record<string, unknown> | null;
  const resolved = job.resolved_concept as ResolvedConcept | null;
  const freshness = job.research?.freshness as Record<string, unknown> | null;
  return {
    policyVersion: job.policy_version ?? CONCEPT_AI_POLICY_VERSION,
    promptVersion: job.prompt_version ?? PROMPT_BUNDLE_VERSION,
    promptHash: job.prompt_hash ?? PROMPT_BUNDLE_HASH,
    modelId: job.model_id ?? KIMI_MODEL,
    reportSchemaVersion: REPORT_SCHEMA_VERSION,
    conceptResolutionStatus: resolved?.resolutionStatus ?? "not_available",
    resolverConfidence: resolved?.confidence ?? null,
    researchRoundCount: state?.round ?? null,
    plannedQueryCount: state?.queries?.length ?? 0,
    successfulQueryCount: state?.completedQueryIds?.length ?? 0,
    failedQueryCount: state?.failedQueryIds?.length ?? 0,
    uniqueSourceCount: quality?.uniqueSources ?? 0,
    uniqueDomainCount: quality?.uniqueDomains ?? 0,
    authoritativeSourceCount: quality?.authoritativeSources ?? 0,
    extractionAttemptedCount:
      state?.sources?.filter((source) => source.extractionAttempted).length ?? 0,
    successfulExtractionCount: quality?.extractedSources ?? 0,
    staleCategoryCount: Array.isArray(freshness?.staleCategories)
      ? freshness.staleCategories.length
      : 0,
    researchQualityScore: quality?.score ?? 0,
    researchPersistenceStatus,
  };
}

const admin = () =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

function safeErrorMessage(error: unknown): string {
  if (error instanceof KimiError) return error.message;
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && typeof (error as { message?: string }).message === "string") {
    return (error as { message: string }).message;
  }
  return "Analysis failed. Please try again.";
}

function retryableError(error: unknown): boolean {
  if (!(error instanceof KimiError)) return true;
  return ![400, 401, 402, 403, 404].includes(error.status);
}

function kickWorker(secret: string) {
  const task = fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/analysis-worker`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-worker-secret": secret },
    body: "{}",
    signal: AbortSignal.timeout(10_000),
  }).catch((error) => {
    console.warn(
      "analysis-worker self-kick failed",
      error instanceof Error ? error.message : String(error),
    );
  });

  try {
    // deno-lint-ignore no-explicit-any
    (globalThis as any).EdgeRuntime?.waitUntil?.(task);
  } catch (_) { /* ignore */ }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const db = admin();

  const { data: config, error: configError } = await db
    .from("job_worker_config")
    .select("worker_secret")
    .eq("id", true)
    .maybeSingle();

  if (configError) {
    console.error("worker config read failed", configError.message);
    return json({ error: "worker_config_failed" }, 500);
  }

  const secret = config?.worker_secret ?? "";
  const provided = req.headers.get("x-worker-secret") ?? "";
  if (!secret || provided !== secret) return json({ error: "Forbidden" }, 403);

  const { data: messages, error: queueError } = await db.rpc("read_analysis_job_queue", {
    p_vt: 240,
    p_qty: 1,
  });

  if (queueError) {
    console.error("queue read failed", queueError.message);
    return json({ error: "queue_read_failed" }, 500);
  }

  const message = Array.isArray(messages) && messages.length > 0 ? messages[0] : null;
  if (!message) return json({ idle: true });

  const messageId = Number(message.msg_id);
  const jobId = String(message.job_id);

  const { data: claimedRows, error: claimError } = await db.rpc("claim_analysis_job", {
    p_job_id: jobId,
    p_lease_seconds: LEASE_SECONDS,
  });

  if (claimError) {
    console.error("job claim failed", jobId, claimError.message);
    return json({ error: "job_claim_failed" }, 500);
  }

  const job = Array.isArray(claimedRows) && claimedRows.length > 0 ? claimedRows[0] : null;

  // Remove the queue message after the database claim. Recovery is driven by
  // the persisted job row and lease.
  await db.rpc("delete_analysis_job_msg", { p_msg_id: messageId });

  if (!job) {
    kickWorker(secret);
    return json({ skipped: true, jobId });
  }

  const leaseToken = String(job.lease_token);
  let expectedStatus = String(job.status);
  let activeAttempt = 0;
  let activeAttemptKey = expectedStatus;

  const updateWithLease = async (patch: Record<string, unknown>) => {
    const { data, error } = await db
      .from("analysis_jobs")
      .update(patch)
      .eq("id", jobId)
      .eq("lease_token", leaseToken)
      .eq("status", expectedStatus)
      .select("id, status")
      .maybeSingle();

    if (error) throw error;
    return data;
  };

  const releaseLease = async (patch: Record<string, unknown>) =>
    updateWithLease({ ...patch, lease_token: null, lease_expires_at: null });

  const enqueueNext = async (delay = 0) => {
    const { error } = await db.rpc("enqueue_analysis_job", { p_job_id: jobId, p_delay: delay });
    if (error) {
      // The watchdog will recover a job without a queue message.
      console.error("enqueue next stage failed", jobId, error.message);
      return;
    }
    kickWorker(secret);
  };

  const beginStageAttempt = async (key: string, detail: string) => {
    const attempts =
      job.stage_attempts && typeof job.stage_attempts === "object"
        ? { ...job.stage_attempts as Record<string, number> }
        : {} as Record<string, number>;

    const previous = Number(attempts[key] ?? 0);
    if (previous >= MAX_STAGE_ATTEMPTS) {
      throw new KimiError(504, `The ${detail.toLowerCase()} stage exceeded its retry limit.`);
    }

    activeAttempt = previous + 1;
    activeAttemptKey = key;
    attempts[key] = activeAttempt;

    const updated = await updateWithLease({
      stage_attempts: attempts,
      attempts: Number(job.attempts ?? 0) + 1,
      stage_detail: detail,
      error: null,
    });

    if (!updated) throw new Error("Worker lease is no longer active.");
    return attempts;
  };

  try {
    const inputs =
      job.inputs && typeof job.inputs === "object"
        ? job.inputs as Record<string, string>
        : {} as Record<string, string>;

    /* RESEARCH */
    if (expectedStatus === "queued" || expectedStatus === "researching") {
      let state: ResearchState =
        job.research_state &&
        typeof job.research_state === "object" &&
        typeof (job.research_state as ResearchState).phase === "string"
          ? job.research_state as ResearchState
          : createInitialResearchState();
      state = {
        ...state,
        sources: ensureResearchSourceIds(state.sources ?? []),
      };

      if (expectedStatus === "queued") {
        state = createInitialResearchState();
        const moved = await updateWithLease({
          status: "researching",
          stage: "researching",
          stage_detail: "Planning targeted market research",
          research_state: state,
          research_started_at: state.startedAt,
          error: null,
        });
        if (!moved) return json({ stale: true, jobId });
        expectedStatus = "researching";
      }

      /* KIMI RESEARCH PLANNING */
      if (state.phase === "planning") {
        await beginStageAttempt(
          `research:planning:${state.round}`,
          "Planning targeted market research",
        );

        const planned = await planResearchQueries(inputs);
        if (planned.length === 0) {
          throw new KimiError(502, "Kimi did not return a valid research plan.");
        }

        const nextState: ResearchState = {
          ...state,
          phase: "searching",
          queries: planned,
          updatedAt: new Date().toISOString(),
        };

        const saved = await releaseLease({
          research_state: nextState,
          stage_detail:
            `Searching ${Math.min(SEARCH_BATCH_SIZE, planned.length)} targeted queries in parallel`,
          error: null,
        });

        if (saved) await enqueueNext();
        return json({ ok: true, jobId, researchPhase: "searching", queryCount: planned.length });
      }

      /* PARALLEL TAVILY SEARCH */
      if (state.phase === "searching") {
        const completed = new Set(state.completedQueryIds ?? []);
        const failed = new Set(state.failedQueryIds ?? []);
        const pending = state.queries
          .filter((query) => !completed.has(query.id) && !failed.has(query.id))
          .sort((a, b) => b.priority - a.priority);

        if (pending.length === 0) {
          const nextState: ResearchState = {
            ...state,
            phase: "extracting",
            updatedAt: new Date().toISOString(),
          };
          const saved = await releaseLease({
            research_state: nextState,
            stage_detail: "Reading the strongest source pages",
            error: null,
          });
          if (saved) await enqueueNext();
          return json({ ok: true, jobId, researchPhase: "extracting" });
        }

        const batch = pending.slice(0, SEARCH_BATCH_SIZE);
        await beginStageAttempt(
          `research:searching:${state.round}:${batch.map((query) => query.id).join(",")}`,
          `Searching ${batch.length} targeted queries in parallel`,
        );

        const result = await runSearchBatch(batch, {
          alreadyCompletedIds: Array.from(completed),
        });
        const mergedSources = mergeResearchSources(state.sources ?? [], result.sources);
        const completedIds = Array.from(
          new Set([...(state.completedQueryIds ?? []), ...result.completedQueryIds]),
        );
        const failedIds = Array.from(
          new Set([...(state.failedQueryIds ?? []), ...result.failedQueryIds]),
        );
        const remaining = state.queries.filter(
          (query) => !completedIds.includes(query.id) && !failedIds.includes(query.id),
        );

        const nextState: ResearchState = {
          ...state,
          phase: remaining.length > 0 ? "searching" : "extracting",
          completedQueryIds: completedIds,
          failedQueryIds: failedIds,
          sources: mergedSources,
          updatedAt: new Date().toISOString(),
        };

        const saved = await releaseLease({
          research_state: nextState,
          stage_detail: remaining.length > 0
            ? `Searching ${Math.min(SEARCH_BATCH_SIZE, remaining.length)} more queries · ${mergedSources.length} unique sources found`
            : `Reading source pages · ${mergedSources.length} unique sources found`,
          error: null,
        });

        if (saved) await enqueueNext();
        return json({
          ok: true,
          jobId,
          researchPhase: nextState.phase,
          uniqueSources: mergedSources.length,
          remainingQueries: remaining.length,
        });
      }

      /* TAVILY PAGE EXTRACTION */
      if (state.phase === "extracting") {
        const selected = selectExtractionBatch(state.sources ?? []);
        const extractedCount = countExtractedSources(state.sources ?? []);
        const extractionTarget = Math.min(
          Math.max(MIN_UNIQUE_SOURCES, 30),
          (state.sources ?? []).length,
        );

        if (selected.length === 0 || extractedCount >= extractionTarget) {
          const nextState: ResearchState = {
            ...state,
            phase: "reviewing",
            updatedAt: new Date().toISOString(),
          };
          const saved = await releaseLease({
            research_state: nextState,
            stage_detail: "Kimi is reviewing evidence coverage",
            error: null,
          });
          if (saved) await enqueueNext();
          return json({
            ok: true,
            jobId,
            researchPhase: "reviewing",
            extractedSources: extractedCount,
          });
        }

        await beginStageAttempt(
          `research:extracting:${state.round}:${extractedCount}`,
          `Reading ${selected.length} source pages`,
        );

        const extracted = await extractSourceBatch(selected, inputs);
        const updatedSources = applyExtractedSources(state.sources, extracted);
        const newExtractedCount = countExtractedSources(updatedSources);
        const moreToExtract =
          newExtractedCount < extractionTarget &&
          selectExtractionBatch(updatedSources).length > 0;

        const nextState: ResearchState = {
          ...state,
          phase: moreToExtract ? "extracting" : "reviewing",
          sources: updatedSources,
          updatedAt: new Date().toISOString(),
        };

        const saved = await releaseLease({
          research_state: nextState,
          stage_detail: moreToExtract
            ? `Reading more sources · ${newExtractedCount} pages reviewed`
            : `Kimi is reviewing ${updatedSources.length} unique sources`,
          error: null,
        });

        if (saved) await enqueueNext();
        return json({
          ok: true,
          jobId,
          researchPhase: nextState.phase,
          extractedSources: newExtractedCount,
        });
      }

      /* KIMI RESEARCH REVIEW */
      if (state.phase === "reviewing") {
        await beginStageAttempt(
          `research:reviewing:${state.round}`,
          "Reviewing evidence quality and research gaps",
        );

        const quality = computeResearchQuality(state.sources ?? []);
        const review = await reviewResearch(inputs, state, quality);
        const reviewedState: ResearchState = {
          ...state,
          review,
          updatedAt: new Date().toISOString(),
        };

        if (shouldContinueResearch(reviewedState, quality, review)) {
          const remainingSlots = Math.max(0, MAX_TOTAL_QUERIES - state.queries.length);
          const additionalQueries = review.additionalQueries.slice(0, remainingSlots);

          if (additionalQueries.length > 0) {
            const nextState: ResearchState = {
              ...reviewedState,
              phase: "searching",
              round: state.round + 1,
              queries: [...state.queries, ...additionalQueries],
              updatedAt: new Date().toISOString(),
            };

            const saved = await releaseLease({
              research_state: nextState,
              research_quality: quality,
              stage_detail:
                `Expanding research for ${review.missingAreas.length} evidence gaps · round ${nextState.round} of ${MAX_RESEARCH_ROUNDS}`,
              error: null,
            });

            if (saved) await enqueueNext();
            return json({
              ok: true,
              jobId,
              researchPhase: "searching",
              researchRound: nextState.round,
              uniqueSources: quality.uniqueSources,
              qualityScore: quality.score,
              missingAreas: review.missingAreas,
            });
          }
        }

        // Resolve a concrete analytical baseline before report generation.
        const resolvingState: ResearchState = {
          ...reviewedState,
          phase: "resolving",
          updatedAt: new Date().toISOString(),
        };
        const publicResearch = buildPublicResearch(resolvingState, quality);

        const saved = await releaseLease({
          research_state: resolvingState,
          research_quality: quality,
          research: publicResearch,
          stage_detail: "Resolving the baseline project scenario from research",
          error: null,
        });

        if (saved) await enqueueNext();
        return json({
          ok: true,
          jobId,
          stage: "researching",
          researchPhase: "resolving",
          uniqueSources: quality.uniqueSources,
          uniqueDomains: quality.uniqueDomains,
          qualityScore: quality.score,
          qualityLevel: quality.level,
          researchBudgetExhausted: researchBudgetExhausted(resolvingState),
        });
      }

      /* KIMI CONCEPT RESOLUTION */
      if (state.phase === "resolving") {
        await beginStageAttempt(
          "research:resolving",
          "Resolving the baseline project scenario from research",
        );

        const quality =
          job.research_quality && typeof job.research_quality === "object"
            ? job.research_quality as ReturnType<typeof computeResearchQuality>
            : computeResearchQuality(state.sources ?? []);
        let resolvedConcept: ResolvedConcept | null = null;

        if (conceptResolverEnabled()) {
          try {
            resolvedConcept = await resolveConcept(inputs, state, quality);
          } catch (resolverError) {
            if (activeAttempt < MAX_STAGE_ATTEMPTS) throw resolverError;
            if (!conceptIsSpecificEnough(inputs)) {
              throw new KimiError(
                400,
                "The project scenario could not be made specific enough for reliable analysis. Add the intended customer, solution, geography, budget, and operating model, then try again.",
              );
            }
            console.warn(
              "concept resolver exhausted retries; continuing with a specific original brief",
              jobId,
            );
          }
        }

        const completedState: ResearchState = {
          ...state,
          phase: "completed",
          updatedAt: new Date().toISOString(),
        };
        const publicResearch = buildPublicResearch(completedState, quality);
        const saved = await releaseLease({
          research_state: completedState,
          research_quality: quality,
          research: publicResearch,
          resolved_concept: resolvedConcept,
          research_completed_at: new Date().toISOString(),
          status: "generating",
          stage: "generating",
          generation_step: Number(job.generation_step ?? 0),
          stage_detail: `${REPORT_PARTS[0].label} — section 1 of ${REPORT_PARTS.length}`,
          error: null,
        });

        if (saved) await enqueueNext();
        return json({
          ok: true,
          jobId,
          stage: "generating",
          conceptResolutionStatus:
            resolvedConcept?.resolutionStatus ?? "specific_brief_fallback",
        });
      }

      throw new Error(`Unsupported research phase: ${state.phase}`);
    }


    /* GENERATION */
    if (expectedStatus === "generating") {
      const generationParts =
        job.generation_parts && typeof job.generation_parts === "object"
          ? { ...job.generation_parts as Record<string, unknown> }
          : {} as Record<string, unknown>;

      let step = Math.max(0, Number(job.generation_step ?? 0));

      // Skip every part that was already persisted.
      while (step < REPORT_PARTS.length && generationParts[REPORT_PARTS[step].key]) {
        step += 1;
      }

      // Recovery: all parts exist but the worker died before validation.
      if (step >= REPORT_PARTS.length) {
        const merged = mergeReportParts(generationParts);
        validateMergedReport(merged);
        const draft = buildBaseReport(
          merged,
          job.research ?? {},
          job.resolved_concept as ResolvedConcept | null,
        );

        const saved = await releaseLease({
          generation_step: REPORT_PARTS.length,
          generation_parts: generationParts,
          draft,
          status: "validating",
          stage: "validating",
          stage_detail: "Checking report consistency",
          error: null,
        });

        if (saved) await enqueueNext();
        return json({ ok: true, jobId, stage: "validating" });
      }

      const part = REPORT_PARTS[step];

      await beginStageAttempt(
        `generating:${part.key}`,
        `${part.label} — section ${step + 1} of ${REPORT_PARTS.length}`,
      );

      const previousParts = Object.fromEntries(
        REPORT_PARTS.slice(0, step)
          .filter((previousPart) => generationParts[previousPart.key])
          .map((previousPart) => [previousPart.key, generationParts[previousPart.key]]),
      );

      const { systemPrompt, userPrompt } = buildPartPrompts(
        inputs,
        job.research ?? {},
        part,
        previousParts,
        job.resolved_concept as ResolvedConcept | null,
      );


      const parsedPart = await kimiStructured(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        `provide_${part.key}_report`,
        `Provide the ${part.label} report section.`,
        part.schema as Record<string, unknown>,
        { reasoningEffort: "low", timeoutMs: KIMI_TIMEOUT_MS },
      );

      if (!parsedPart || typeof parsedPart !== "object" || Array.isArray(parsedPart)) {
        throw new KimiError(502, `Kimi returned an invalid ${part.label} section.`);
      }

      const nextParts = { ...generationParts, [part.key]: parsedPart };
      validateGeneratedPart(part.key, nextParts);
      const nextStep = step + 1;

      if (nextStep < REPORT_PARTS.length) {
        const nextPart = REPORT_PARTS[nextStep];
        const saved = await releaseLease({
          generation_parts: nextParts,
          generation_step: nextStep,
          status: "generating",
          stage: "generating",
          stage_detail: `${nextPart.label} — section ${nextStep + 1} of ${REPORT_PARTS.length}`,
          error: null,
        });

        if (saved) await enqueueNext();
        return json({
          ok: true,
          jobId,
          stage: "generating",
          completedPart: part.key,
          nextPart: nextPart.key,
        });
      }

      const merged = mergeReportParts(nextParts);
      validateMergedReport(merged);
      const draft = buildBaseReport(
        merged,
        job.research ?? {},
        job.resolved_concept as ResolvedConcept | null,
      );

      const saved = await releaseLease({
        generation_parts: nextParts,
        generation_step: REPORT_PARTS.length,
        draft,
        status: "validating",
        stage: "validating",
        stage_detail: "Checking report consistency",
        error: null,
      });

      if (saved) await enqueueNext();
      return json({ ok: true, jobId, stage: "validating", completedPart: part.key });
    }

    /* VALIDATION */
    if (expectedStatus === "validating") {
      await beginStageAttempt("validating", "Checking report consistency");

      if (!job.draft || typeof job.draft !== "object") {
        throw new Error("Persisted report draft is missing.");
      }

      const enriched = ensureEvidenceFields(job.draft, inputs);
      const finalized = finalizeReportDeterministically(
        enriched,
        job.research_quality as { score?: number; level?: string } | null,
      );
      const report = deepSanitize(finalized);

      const scores = report.scores as Record<string, unknown> | undefined;
      if (!scores) throw new Error("Final report scores are missing.");

      const overall = Number(scores.overall);
      const expectedVerdict = overall >= 7.5
        ? "PROCEED"
        : overall >= 6.0
          ? "PROCEED WITH CAUTION"
          : overall >= 4.5
            ? "REVISE"
            : "DO NOT PROCEED";
      if (scores.verdict !== expectedVerdict) {
        throw new Error("Final report verdict does not match its score.");
      }

      const weightSum = Object.values(
        (scores.weights ?? {}) as Record<string, unknown>,
      ).reduce((sum: number, value) => sum + Number(value ?? 0), 0);
      if (Math.abs(weightSum - 1) > 0.001) {
        throw new Error("FMART-O weights do not sum to 1.");
      }


      const saved = await releaseLease({
        draft: report,
        status: "saving",
        stage: "saving",
        stage_detail: "Saving the completed report",
        error: null,
      });

      if (saved) await enqueueNext();
      return json({ ok: true, jobId, stage: "saving" });
    }

    /* SAVING */
    if (expectedStatus === "saving") {
      await beginStageAttempt("saving", "Saving the completed report");

      const saveOperationKey = `analysis-job-${jobId}`;
      let reportId = typeof job.report_id === "string" ? job.report_id : null;

      if (!reportId) {
        const { data: existingReport } = await db
          .from("reports")
          .select("id")
          .eq("save_operation_key", saveOperationKey)
          .maybeSingle();
        reportId = existingReport?.id ?? null;
      }

      // Re-run support: link the new report to the report being improved and
      // append a version-comparison entry. The original row is never modified.
      const parentReportId = typeof job.parent_report_id === "string" ? job.parent_report_id : null;
      let output: any = job.draft;
      if (parentReportId && job.previous_output && job.previous_inputs) {
        try {
          const previous = ensureEvidenceFields(job.previous_output, job.previous_inputs);
          const versionEntry = buildVersionEntry(
            previous,
            output,
            job.previous_inputs as Record<string, unknown>,
            inputs,
          );
          const history = Array.isArray((job.previous_output as any).reportVersions)
            ? (job.previous_output as any).reportVersions
            : [];
          output = { ...output, reportVersions: [...history, versionEntry] };
        } catch (versionError) {
          console.warn(
            "version entry build failed",
            versionError instanceof Error ? versionError.message : String(versionError),
          );
        }
      }

      if (!reportId) {
        const { data: inserted, error: insertError } = await db
          .from("reports")
          .insert({
            user_id: job.user_id,
            title: inputs.projectName || "Untitled analysis",
            industry: inputs.industry || null,
            inputs,
            output,
            parent_report_id: parentReportId,
            root_report_id:
              typeof job.root_report_id === "string" ? job.root_report_id : null,
            save_operation_key: saveOperationKey,
            model_id: KIMI_MODEL,
            prompt_version: job.prompt_version ?? PROMPT_BUNDLE_VERSION,
            report_schema_version: REPORT_SCHEMA_VERSION,
            source_mode: "in_app",
            source_schema_version: "in_app.v1",
            source_snapshot_metadata: sourceSnapshotMetadata(job, "pending"),
          })
          .select("id")
          .single();

        if (insertError) {
          // A prior worker may have inserted the same report before termination.
          if (insertError.code === "23505") {
            const { data: recovered } = await db
              .from("reports")
              .select("id")
              .eq("save_operation_key", saveOperationKey)
              .single();
            reportId = recovered?.id ?? null;
          } else {
            throw insertError;
          }
        } else {
          reportId = inserted?.id ?? null;
        }
      }

      if (!reportId) throw new Error("Could not persist the completed report.");

      const completedAt = new Date();
      const researchState = job.research_state as ResearchState | null;
      const researchQuality = job.research_quality as ReturnType<
        typeof computeResearchQuality
      > | null;
      if (!researchState || !researchQuality) {
        throw new Error("Completed research state is missing.");
      }
      await persistReportResearchSnapshot(
        supabaseResearchPersistenceStore(db),
        {
          reportId,
          analysisJobId: jobId,
          state: {
            ...researchState,
            sources: ensureResearchSourceIds(researchState.sources ?? []),
          },
          quality: researchQuality,
          policyVersion: job.policy_version ?? CONCEPT_AI_POLICY_VERSION,
          promptVersion: job.prompt_version ?? PROMPT_BUNDLE_VERSION,
          promptHash: job.prompt_hash ?? PROMPT_BUNDLE_HASH,
          modelId: job.model_id ?? KIMI_MODEL,
          freshness:
            job.research?.freshness && typeof job.research.freshness === "object"
              ? job.research.freshness
              : {},
          sourceSnapshotMetadata: sourceSnapshotMetadata(job, "completed"),
          completedAt: completedAt.toISOString(),
        },
      );

      const elapsedSeconds = Math.max(
        1,
        Math.round((completedAt.getTime() - new Date(job.started_at).getTime()) / 1000),
      );
      const minutes = Math.floor(elapsedSeconds / 60);
      const duration = minutes > 0 ? `${minutes}m ${elapsedSeconds % 60}s` : `${elapsedSeconds}s`;

      const completed = await releaseLease({
        report_id: reportId,
        status: "completed",
        stage: "completed",
        stage_detail: null,
        completed_at: completedAt.toISOString(),
        error: null,
        queue_pending: false,
      });

      if (!completed) return json({ stale: true, jobId });

      const { data: existingNotification } = await db
        .from("notifications")
        .select("id")
        .eq("user_id", job.user_id)
        .eq("report_id", reportId)
        .eq("kind", "analysis")
        .maybeSingle();

      if (!existingNotification) {
        await db.from("notifications").insert({
          user_id: job.user_id,
          report_id: reportId,
          kind: "analysis",
          title: `${job.title} analysis is ready`,
          body: `Completed in ${duration}.`,
          url: `/reports/${reportId}`,
        });
      }

      kickWorker(secret);
      return json({ ok: true, jobId, stage: "completed", reportId });
    }

    await releaseLease({
      status: "failed",
      stage: "failed",
      stage_detail: null,
      error: `Unsupported analysis stage: ${expectedStatus}`,
      completed_at: new Date().toISOString(),
      queue_pending: false,
    });

    return json({ failed: true, jobId });
  } catch (error) {
    const message = safeErrorMessage(error);

    console.error("analysis-worker stage failed", {
      jobId,
      status: expectedStatus,
      attemptKey: activeAttemptKey,
      attempt: activeAttempt,
      error: safeErrorMessage(error),
    });

    const shouldFail = !retryableError(error) || activeAttempt >= MAX_STAGE_ATTEMPTS;

    const patch = shouldFail
      ? {
          status: "failed",
          stage: "failed",
          stage_detail: null,
          error: message,
          completed_at: new Date().toISOString(),
          queue_pending: false,
        }
      : {
          error: message,
          stage_detail: `Retrying ${activeAttemptKey} after attempt ${activeAttempt}`,
          queue_pending: false,
        };

    let updated = null;
    try {
      updated = await releaseLease(patch);
    } catch (updateError) {
      console.error(
        "failed to persist worker error",
        jobId,
        updateError instanceof Error ? updateError.message : String(updateError),
      );
    }

    if (!updated) return json({ stale: true, jobId });

    if (shouldFail) {
      await db.from("notifications").insert({
        user_id: job.user_id,
        kind: "analysis",
        title: `${job.title} analysis could not be completed`,
        body: message,
        url: `/analysis/${jobId}`,
      });
      return json({ failed: true, jobId, attempt: activeAttempt });
    }

    const retryDelay = activeAttempt === 1 ? 10 : activeAttempt === 2 ? 30 : 60;
    await enqueueNext(retryDelay);

    return json({ retry: true, jobId, attempt: activeAttempt, retryDelay });
  }
});
