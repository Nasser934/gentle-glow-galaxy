import { describe, expect, it } from "vitest";
import { validatePdfExportData } from "@/lib/exportPdf";
import { validateXlsxExportData } from "@/lib/exportXlsx";
import { validatePptxExportData } from "@/lib/exportPptx";
import { normalizeExternalAnalysis } from "@/lib/reportContract";
import { legacyThermoFlowExternalPayload } from "@/test/fixtures/reports";

describe("canonical export entry guards", () => {
  it("allows the repaired external report through PDF, XLSX, and PPTX exporters", () => {
    const normalized = normalizeExternalAnalysis(legacyThermoFlowExternalPayload, {
      reportId: "CAI-2026-00000094",
    });
    if (!("output" in normalized)) throw new Error("external fixture did not normalize");

    expect(validatePdfExportData(normalized.output, normalized.inputs).output.reportId)
      .toBe("CAI-2026-00000094");
    expect(validateXlsxExportData(normalized.output, normalized.inputs).output.reportId)
      .toBe("CAI-2026-00000094");
    expect(validatePptxExportData(normalized.output, normalized.inputs).output.reportId)
      .toBe("CAI-2026-00000094");
  });

  it("stops every exporter before property access when canonical fields are absent", () => {
    const normalized = normalizeExternalAnalysis(legacyThermoFlowExternalPayload);
    if (!("output" in normalized)) throw new Error("external fixture did not normalize");
    const broken = structuredClone(normalized.output) as unknown as Record<string, unknown>;
    delete broken.financials;

    expect(() => validatePdfExportData(broken, normalized.inputs))
      .toThrow(/Report data is incompatible.*output\.financials/);
    expect(() => validateXlsxExportData(broken, normalized.inputs))
      .toThrow(/Report data is incompatible.*output\.financials/);
    expect(() => validatePptxExportData(broken, normalized.inputs))
      .toThrow(/Report data is incompatible.*output\.financials/);
  });
});
