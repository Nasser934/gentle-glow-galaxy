import { describe, expect, it } from "vitest";
import {
  assessInputQuality,
  buildVersionEntry,
  ensureEvidenceFields,
} from "@/lib/evidence";
import {
  canonicalInputsFixture,
  canonicalReportFixture,
} from "@/test/fixtures/reports";

describe("Brief Clarity responsibility policy", () => {
  it("does not score research-resolvable public fields", () => {
    const withoutPublicFields = {
      ...canonicalInputsFixture,
      competitorUrls: "",
      regulatoryConsiderations: "",
      technologyReadiness: "",
    };
    const withPublicFields = {
      ...withoutPublicFields,
      competitorUrls: "https://competitor.example",
      regulatoryConsiderations: "Public licensing and standards detail.",
      technologyReadiness: "Proven / Mature",
    };

    const missing = assessInputQuality(withoutPublicFields);
    const supplied = assessInputQuality(withPublicFields);

    expect(missing.overall).toBe(supplied.overall);
    expect(missing.fields.map((field) => field.key)).not.toContain("competitorUrls");
    expect(missing.fields.map((field) => field.key)).not.toContain(
      "regulatoryConsiderations",
    );
    expect(missing.fields.map((field) => field.key)).not.toContain(
      "technologyReadiness",
    );
  });

  it("does score missing private budget and team capability", () => {
    const complete = assessInputQuality(canonicalInputsFixture);
    const missingPrivate = assessInputQuality({
      ...canonicalInputsFixture,
      budgetRange: "",
      founderExperience: "",
    });
    expect(missingPrivate.overall).toBeLessThan(complete.overall);
    expect(missingPrivate.missing).toContain("Budget");
    expect(missingPrivate.missing).toContain("Team / founder experience");
  });
});

describe("report evidence enrichment", () => {
  it("does not replace the authoritative score verdict for a thin brief", () => {
    const report = structuredClone(canonicalReportFixture);
    report.scores.overall = 8;
    report.scores.verdict = "PROCEED";

    const enriched = ensureEvidenceFields(report, {
      ...canonicalInputsFixture,
      strategicObjectives: "",
      businessModel: "",
      revenueModel: "",
      budgetRange: "",
      timeline: "",
      founderExperience: "",
    });

    expect(enriched.inputQualityScore).toBeLessThan(60);
    expect(enriched.scores.verdict).toBe("PROCEED");
    expect(enriched.decision?.verdict).not.toBe(
      "IMPROVE INPUTS BEFORE INVESTMENT DECISION",
    );
  });

  it("compares readiness, research quality, and unresolved private decisions", () => {
    const previous = structuredClone(canonicalReportFixture);
    previous.decisionReadinessScore = 5;
    (previous.research as any).quality = { score: 52 };
    (previous as any).resolvedConcept = {
      unresolvedPrivateDecisions: [
        { field: "supplier", decisionImpact: "high" },
        { field: "pricing", decisionImpact: "high" },
      ],
    };
    const next = structuredClone(previous);
    next.decisionReadinessScore = 7.2;
    (next.research as any).quality = { score: 81 };
    (next as any).resolvedConcept = {
      unresolvedPrivateDecisions: [
        { field: "pricing", decisionImpact: "high" },
        { field: "operatingModel", decisionImpact: "medium" },
      ],
    };

    const entry = buildVersionEntry(
      previous,
      next,
      canonicalInputsFixture,
      { ...canonicalInputsFixture, budgetRange: "SAR 5m–10m" },
    );
    expect(entry.decisionReadinessDelta).toBe(2.2);
    expect(entry.researchQualityDelta).toBe(29);
    expect(entry.unresolvedDecisionsResolved).toEqual(["supplier"]);
    expect(entry.unresolvedDecisionsAdded).toEqual(["operatingModel"]);
    expect(entry.changedInputs).toContain("budgetRange");
  });
});
