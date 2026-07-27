export interface VersionParent {
  id: string;
  root_report_id?: string | null;
}

/** Every re-run points to its immediate parent while preserving one family root. */
export function versionLinksForParent(parent: VersionParent): {
  parentReportId: string;
  rootReportId: string;
} {
  return {
    parentReportId: parent.id,
    rootReportId: parent.root_report_id ?? parent.id,
  };
}

/** Includes new root-linked rows and legacy rows whose parent was the root. */
export function versionFamilyFilter(rootReportId: string): string {
  return [
    `id.eq.${rootReportId}`,
    `root_report_id.eq.${rootReportId}`,
    `parent_report_id.eq.${rootReportId}`,
  ].join(",");
}
