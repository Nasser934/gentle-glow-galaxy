import { describe, expect, it, vi } from "vitest";
import { buildReportWorkbook } from "@/lib/exportXlsx";
import { buildReportPresentation } from "@/lib/exportPptx";
import { exportReportToPdf } from "@/lib/exportPdf";
import { demoInputs, demoReport } from "@/data/demoReport";

describe("canonical exports", () => {
  it("builds an XLSX with canonical numeric cells, formulas, and internal-project labels", async () => {
    const workbook = buildReportWorkbook(demoReport, demoInputs);
    const dashboard = workbook.getWorksheet("Dashboard")!;
    const overallRow = dashboard.getRows(1, dashboard.rowCount)!
      .find((row) => row.getCell(1).value === "Overall Score");
    expect(overallRow?.getCell(2).value).toBe("7.5 / 10");

    const scenarios = workbook.getWorksheet("Scenarios")!;
    const headers = scenarios.getRow(1).values;
    expect(headers).toContain("Adoption");
    expect(headers).toContain("Annual Financial Benefit");
    expect(headers).not.toContain("Customers Y1");
    expect(typeof scenarios.getRow(2).getCell(4).value).toBe("number");

    const financial = workbook.getWorksheet("Financial Model")!;
    const formulaCells = financial.getColumn(4).values.filter((value) =>
      typeof value === "object" && value !== null && "formula" in value,
    );
    expect(formulaCells.length).toBeGreaterThan(0);

    const bytes = await workbook.xlsx.writeBuffer();
    expect(bytes.byteLength).toBeGreaterThan(10_000);
  });

  it("builds a 10-slide PowerPoint with safe font fallbacks", async () => {
    const presentation = buildReportPresentation(demoReport, demoInputs);
    const bytes = await presentation.write({ outputType: "uint8array" });
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect((bytes as Uint8Array).byteLength).toBeGreaterThan(20_000);
  });

  it("renders a multi-page PDF with native selectable text commands", async () => {
    const overflowStacks: string[] = [];
    const logSpy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      if (String(args[0] ?? "").includes("could not fit page")) {
        overflowStacks.push(new Error(String(args[0])).stack ?? String(args[0]));
      }
    });
    const result = await exportReportToPdf(
      null,
      "concept-ai-demo.pdf",
      { report: demoReport, inputs: demoInputs },
      { download: false },
    );
    logSpy.mockRestore();
    expect(result.bytes).toBeGreaterThan(20_000);
    expect(result.pageCount).toBeGreaterThan(5);
    expect(result.textRendering).toBe("native-selectable");
    expect(overflowStacks).toEqual([]);
  });
});
