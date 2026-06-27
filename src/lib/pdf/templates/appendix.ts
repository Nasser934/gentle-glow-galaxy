// Phase 1 — Appendix template. Allows wider tables (up to 7 cols) and a softer
// section header style to differentiate reference material from the main report.
import { type Doc, C, MARGIN, setColor, setDraw, ensureSpace, addPage, PAGE_H } from "../engine";

const APPENDIX_LETTERS = ["A", "B", "C", "D", "E", "F", "G"];

let appendixCounter = 0;
export function resetAppendixCounter() { appendixCounter = 0; }

export function startAppendix(doc: Doc, title: string): string {
  // Always start each appendix on a fresh page.
  if (doc.y > 120 || (PAGE_H - doc.y) < 200) addPage(doc);
  const letter = APPENDIX_LETTERS[appendixCounter++] || "Z";
  doc.currentSection = { number: 100 + appendixCounter, title: `Appendix ${letter} — ${title}` };
  ensureSpace(doc, 40);
  const { pdf } = doc;
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(11);
  setColor(pdf, C.muted);
  pdf.text(`APPENDIX ${letter}`, MARGIN, doc.y);
  doc.y += 16;
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(15);
  setColor(pdf, C.text);
  pdf.text(title, MARGIN, doc.y);
  setDraw(pdf, C.primary); pdf.setLineWidth(0.8);
  pdf.line(MARGIN, doc.y + 4, MARGIN + 28, doc.y + 4);
  doc.y += 20;
  doc.toc.push({ number: 100 + appendixCounter, title: `Appendix ${letter} — ${title}`, page: pdf.getCurrentPageInfo().pageNumber });
  return letter;
}
