import jsPDF from "jspdf";
// html2canvas-pro supports modern CSS color functions (oklch/lab/color-mix)
// that the original html2canvas crashes on — needed for shadcn/Tailwind tokens.
import html2canvas from "html2canvas-pro";

/**
 * Renders each `[data-pdf-page]` element from the given root into a single
 * multi-page A4 portrait PDF. Each page element is captured as one A4 page.
 */
export async function exportReportToPdf(rootEl: HTMLElement, fileName: string) {
  const pages = Array.from(rootEl.querySelectorAll<HTMLElement>("[data-pdf-page]"));
  if (pages.length === 0) throw new Error("No pages to export");

  const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
  const pdfW = pdf.internal.pageSize.getWidth();
  const pdfH = pdf.internal.pageSize.getHeight();

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    let canvas: HTMLCanvasElement;
    try {
      canvas = await html2canvas(page, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
        windowWidth: page.scrollWidth,
      });
    } catch (err) {
      console.error(`[exportPdf] page ${i + 1} render failed`, err);
      throw new Error(`Could not render page ${i + 1}: ${(err as Error)?.message ?? "unknown error"}`);
    }
    const img = canvas.toDataURL("image/jpeg", 0.92);

    // Fit by width; if taller than page, scale by height.
    const ratio = canvas.width / canvas.height;
    let renderW = pdfW;
    let renderH = pdfW / ratio;
    if (renderH > pdfH) {
      renderH = pdfH;
      renderW = pdfH * ratio;
    }
    const x = (pdfW - renderW) / 2;
    const y = (pdfH - renderH) / 2;

    if (i > 0) pdf.addPage();
    pdf.addImage(img, "JPEG", x, y, renderW, renderH);
  }

  pdf.save(fileName);
}
