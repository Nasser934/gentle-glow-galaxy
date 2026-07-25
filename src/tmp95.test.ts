import { describe, it } from "vitest";
import fs from "fs";
import { normalizeExternalAnalysis } from "@/lib/reportContract";
describe("x", () => { it("y", () => {
  const p = JSON.parse(fs.readFileSync("/tmp/w/95.json","utf8"));
  const r = normalizeExternalAnalysis(p, { reportId: "CAI-2026-00000095" });
  console.log(JSON.stringify(r.valid ? {ok:true, warnings:(r as any).warnings} : r.issues, null, 1));
});});
