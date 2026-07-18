import type { Database as GeneratedDatabase, Json } from "./types";

type GeneratedPublic = GeneratedDatabase["public"];
type GeneratedHistory = GeneratedPublic["Tables"]["report_status_history"];
type ReportStatus = GeneratedPublic["Enums"]["report_status"];

type ReportCommentResult = {
  id: string;
  report_id: string;
  user_id: string;
  section: string | null;
  body: string;
  created_at: string;
};

type ReportCommentProfileResult = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
};

type ReportStatusHistoryResult = {
  id: string;
  report_id: string;
  changed_by: string;
  from_status: ReportStatus | null;
  to_status: ReportStatus;
  note: string | null;
  change_source: string;
  created_at: string;
};

type HardenedFunctions = {
  get_report_comments: {
    Args: {
      p_report_id: string;
      p_section?: string | null;
    };
    Returns: ReportCommentResult[];
  };
  get_report_comment_profiles: {
    Args: { p_report_id: string };
    Returns: ReportCommentProfileResult[];
  };
  get_report_status_history: {
    Args: { p_report_id: string };
    Returns: ReportStatusHistoryResult[];
  };
  is_canonical_report_output: {
    Args: { p_output: Json };
    Returns: boolean;
  };
  set_report_group_archived: {
    Args: {
      p_report_id: string;
      p_archived: boolean;
    };
    Returns: number;
  };
};

type HardenedHistory = {
  Row: GeneratedHistory["Row"] & { change_source: string };
  Insert: GeneratedHistory["Insert"] & { change_source?: string };
  Update: GeneratedHistory["Update"] & { change_source?: string };
  Relationships: GeneratedHistory["Relationships"];
};

export type Database = Omit<GeneratedDatabase, "public"> & {
  public: Omit<GeneratedPublic, "Tables" | "Functions"> & {
    Tables: Omit<GeneratedPublic["Tables"], "report_status_history"> & {
      report_status_history: HardenedHistory;
    };
    Functions: GeneratedPublic["Functions"] & HardenedFunctions;
  };
};
