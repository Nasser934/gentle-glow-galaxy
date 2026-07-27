import { describe, expect, it } from "vitest";
import {
  versionFamilyFilter,
  versionLinksForParent,
} from "./reportVersioning";

describe("report version links", () => {
  it("uses the immediate report as parent and preserves the family root", () => {
    expect(versionLinksForParent({
      id: "v2",
      root_report_id: "v1",
    })).toEqual({
      parentReportId: "v2",
      rootReportId: "v1",
    });
  });

  it("starts a family at the report being re-run", () => {
    expect(versionLinksForParent({
      id: "v1",
      root_report_id: null,
    })).toEqual({
      parentReportId: "v1",
      rootReportId: "v1",
    });
  });

  it("queries root-linked and legacy root-parent rows", () => {
    expect(versionFamilyFilter("v1")).toBe(
      "id.eq.v1,root_report_id.eq.v1,parent_report_id.eq.v1",
    );
  });
});
