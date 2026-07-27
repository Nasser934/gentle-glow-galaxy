export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      analysis_jobs: {
        Row: {
          attempts: number
          completed_at: string | null
          created_at: string
          draft: Json | null
          error: string | null
          generation_parts: Json
          generation_step: number
          id: string
          inputs: Json
          lease_expires_at: string | null
          lease_token: string | null
          parent_report_id: string | null
          previous_inputs: Json | null
          previous_output: Json | null
          queue_pending: boolean
          report_id: string | null
          research: Json | null
          research_completed_at: string | null
          research_quality: Json
          research_started_at: string | null
          research_state: Json
          root_report_id: string | null
          stage: string
          stage_attempts: Json
          stage_detail: string | null
          started_at: string
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          draft?: Json | null
          error?: string | null
          generation_parts?: Json
          generation_step?: number
          id?: string
          inputs?: Json
          lease_expires_at?: string | null
          lease_token?: string | null
          parent_report_id?: string | null
          previous_inputs?: Json | null
          previous_output?: Json | null
          queue_pending?: boolean
          report_id?: string | null
          research?: Json | null
          research_completed_at?: string | null
          research_quality?: Json
          research_started_at?: string | null
          research_state?: Json
          root_report_id?: string | null
          stage?: string
          stage_attempts?: Json
          stage_detail?: string | null
          started_at?: string
          status?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          draft?: Json | null
          error?: string | null
          generation_parts?: Json
          generation_step?: number
          id?: string
          inputs?: Json
          lease_expires_at?: string | null
          lease_token?: string | null
          parent_report_id?: string | null
          previous_inputs?: Json | null
          previous_output?: Json | null
          queue_pending?: boolean
          report_id?: string | null
          research?: Json | null
          research_completed_at?: string | null
          research_quality?: Json
          research_started_at?: string | null
          research_state?: Json
          root_report_id?: string | null
          stage?: string
          stage_attempts?: Json
          stage_detail?: string | null
          started_at?: string
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analysis_jobs_parent_report_id_fkey"
            columns: ["parent_report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_jobs_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_jobs_root_report_id_fkey"
            columns: ["root_report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_rate_limits: {
        Row: {
          function_name: string
          request_count: number
          subject_key: string
          updated_at: string
          window_kind: string
          window_start: string
        }
        Insert: {
          function_name: string
          request_count?: number
          subject_key: string
          updated_at?: string
          window_kind: string
          window_start: string
        }
        Update: {
          function_name?: string
          request_count?: number
          subject_key?: string
          updated_at?: string
          window_kind?: string
          window_start?: string
        }
        Relationships: []
      }
      analysis_requests: {
        Row: {
          completed_at: string | null
          completion_status: string
          failure_category: string | null
          function_name: string
          id: string
          idempotency_key: string
          ip_hash: string | null
          model_id: string | null
          prompt_version: string | null
          request_hash: string
          research_status: string
          started_at: string
          usage_metadata: Json
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          completion_status?: string
          failure_category?: string | null
          function_name: string
          id?: string
          idempotency_key: string
          ip_hash?: string | null
          model_id?: string | null
          prompt_version?: string | null
          request_hash: string
          research_status?: string
          started_at?: string
          usage_metadata?: Json
          user_id: string
        }
        Update: {
          completed_at?: string | null
          completion_status?: string
          failure_category?: string | null
          function_name?: string
          id?: string
          idempotency_key?: string
          ip_hash?: string | null
          model_id?: string | null
          prompt_version?: string | null
          request_hash?: string
          research_status?: string
          started_at?: string
          usage_metadata?: Json
          user_id?: string
        }
        Relationships: []
      }
      edge_rate_limits: {
        Row: {
          action: string
          count: number
          updated_at: string
          user_id: string
          window_start: string
        }
        Insert: {
          action: string
          count?: number
          updated_at?: string
          user_id: string
          window_start: string
        }
        Update: {
          action?: string
          count?: number
          updated_at?: string
          user_id?: string
          window_start?: string
        }
        Relationships: []
      }
      job_worker_config: {
        Row: {
          created_at: string
          id: boolean
          worker_secret: string
        }
        Insert: {
          created_at?: string
          id?: boolean
          worker_secret?: string
        }
        Update: {
          created_at?: string
          id?: boolean
          worker_secret?: string
        }
        Relationships: []
      }
      mcp_write_idempotency: {
        Row: {
          created_at: string
          id: string
          idempotency_key: string
          report_id: string | null
          response: Json
          tool_name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          idempotency_key: string
          report_id?: string | null
          response?: Json
          tool_name: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          idempotency_key?: string
          report_id?: string | null
          response?: Json
          tool_name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_write_idempotency_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
          body: string | null
          created_at: string
          id: string
          kind: string
          read_at: string | null
          report_id: string | null
          title: string
          url: string | null
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          read_at?: string | null
          report_id?: string | null
          title: string
          url?: string | null
          user_id: string
        }
        Update: {
          actor_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          read_at?: string | null
          report_id?: string | null
          title?: string
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      report_comments: {
        Row: {
          body: string
          created_at: string
          id: string
          report_id: string
          section: string | null
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          report_id: string
          section?: string | null
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          report_id?: string
          section?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_comments_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      report_exports: {
        Row: {
          created_at: string
          display_url: string | null
          error: string | null
          format: string
          id: string
          idempotency_key: string | null
          report_id: string
          requested_by: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_url?: string | null
          error?: string | null
          format: string
          id?: string
          idempotency_key?: string | null
          report_id: string
          requested_by?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_url?: string | null
          error?: string | null
          format?: string
          id?: string
          idempotency_key?: string | null
          report_id?: string
          requested_by?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_exports_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      report_slug_aliases: {
        Row: {
          migrated_at: string
          old_slug: string
          report_id: string
        }
        Insert: {
          migrated_at?: string
          old_slug: string
          report_id: string
        }
        Update: {
          migrated_at?: string
          old_slug?: string
          report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_slug_aliases_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      report_status_history: {
        Row: {
          changed_by: string
          created_at: string
          from_status: Database["public"]["Enums"]["report_status"] | null
          id: string
          note: string | null
          report_id: string
          to_status: Database["public"]["Enums"]["report_status"]
        }
        Insert: {
          changed_by: string
          created_at?: string
          from_status?: Database["public"]["Enums"]["report_status"] | null
          id?: string
          note?: string | null
          report_id: string
          to_status: Database["public"]["Enums"]["report_status"]
        }
        Update: {
          changed_by?: string
          created_at?: string
          from_status?: Database["public"]["Enums"]["report_status"] | null
          id?: string
          note?: string | null
          report_id?: string
          to_status?: Database["public"]["Enums"]["report_status"]
        }
        Relationships: [
          {
            foreignKeyName: "report_status_history_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          archived_at: string | null
          canonical_schema_version: string | null
          canonical_validated: boolean
          created_at: string
          display_id: string
          external_agent_metadata: Json
          generation_seed: number | null
          generation_timestamp: string | null
          id: string
          industry: string | null
          input_hash: string | null
          inputs: Json
          is_public: boolean
          legacy_report_id: string | null
          model_id: string | null
          normalization_timestamp: string | null
          normalization_warnings: Json
          original_payload: Json | null
          output: Json
          parent_report_id: string | null
          prompt_version: string | null
          report_schema_version: string | null
          research_timestamp: string | null
          root_report_id: string | null
          save_operation_key: string | null
          scoring_engine_version: string | null
          slug: string
          source_mode: string
          source_schema_version: string | null
          source_snapshot_metadata: Json
          status: Database["public"]["Enums"]["report_status"]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          canonical_schema_version?: string | null
          canonical_validated?: boolean
          created_at?: string
          display_id?: string
          external_agent_metadata?: Json
          generation_seed?: number | null
          generation_timestamp?: string | null
          id?: string
          industry?: string | null
          input_hash?: string | null
          inputs: Json
          is_public?: boolean
          legacy_report_id?: string | null
          model_id?: string | null
          normalization_timestamp?: string | null
          normalization_warnings?: Json
          original_payload?: Json | null
          output: Json
          parent_report_id?: string | null
          prompt_version?: string | null
          report_schema_version?: string | null
          research_timestamp?: string | null
          root_report_id?: string | null
          save_operation_key?: string | null
          scoring_engine_version?: string | null
          slug?: string
          source_mode?: string
          source_schema_version?: string | null
          source_snapshot_metadata?: Json
          status?: Database["public"]["Enums"]["report_status"]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          canonical_schema_version?: string | null
          canonical_validated?: boolean
          created_at?: string
          display_id?: string
          external_agent_metadata?: Json
          generation_seed?: number | null
          generation_timestamp?: string | null
          id?: string
          industry?: string | null
          input_hash?: string | null
          inputs?: Json
          is_public?: boolean
          legacy_report_id?: string | null
          model_id?: string | null
          normalization_timestamp?: string | null
          normalization_warnings?: Json
          original_payload?: Json | null
          output?: Json
          parent_report_id?: string | null
          prompt_version?: string | null
          report_schema_version?: string | null
          research_timestamp?: string | null
          root_report_id?: string | null
          save_operation_key?: string | null
          scoring_engine_version?: string | null
          slug?: string
          source_mode?: string
          source_schema_version?: string | null
          source_snapshot_metadata?: Json
          status?: Database["public"]["Enums"]["report_status"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_parent_report_id_fkey"
            columns: ["parent_report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_root_report_id_fkey"
            columns: ["root_report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      begin_analysis_request: {
        Args: {
          p_function_name: string
          p_idempotency_key: string
          p_ip_hash?: string
          p_request_hash: string
        }
        Returns: {
          allowed: boolean
          reason: string
          request_id: string
          retry_after_seconds: number
        }[]
      }
      can_view_report: { Args: { _report_id: string }; Returns: boolean }
      claim_analysis_job: {
        Args: { p_job_id: string; p_lease_seconds?: number }
        Returns: {
          attempts: number
          completed_at: string | null
          created_at: string
          draft: Json | null
          error: string | null
          generation_parts: Json
          generation_step: number
          id: string
          inputs: Json
          lease_expires_at: string | null
          lease_token: string | null
          parent_report_id: string | null
          previous_inputs: Json | null
          previous_output: Json | null
          queue_pending: boolean
          report_id: string | null
          research: Json | null
          research_completed_at: string | null
          research_quality: Json
          research_started_at: string | null
          research_state: Json
          root_report_id: string | null
          stage: string
          stage_attempts: Json
          stage_detail: string | null
          started_at: string
          status: string
          title: string
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "analysis_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      complete_analysis_request: {
        Args: {
          p_completion_status: string
          p_failure_category?: string
          p_model_id?: string
          p_prompt_version?: string
          p_request_id: string
          p_research_status?: string
          p_usage_metadata?: Json
        }
        Returns: boolean
      }
      delete_analysis_job_msg: { Args: { p_msg_id: number }; Returns: boolean }
      enqueue_analysis_job: {
        Args: { p_delay?: number; p_job_id: string }
        Returns: number
      }
      generate_report_display_id: { Args: never; Returns: string }
      generate_report_slug: { Args: never; Returns: string }
      get_report_by_slug: {
        Args: { p_slug: string }
        Returns: {
          archived_at: string | null
          canonical_schema_version: string | null
          canonical_validated: boolean
          created_at: string
          display_id: string
          external_agent_metadata: Json
          generation_seed: number | null
          generation_timestamp: string | null
          id: string
          industry: string | null
          input_hash: string | null
          inputs: Json
          is_public: boolean
          legacy_report_id: string | null
          model_id: string | null
          normalization_timestamp: string | null
          normalization_warnings: Json
          original_payload: Json | null
          output: Json
          parent_report_id: string | null
          prompt_version: string | null
          report_schema_version: string | null
          research_timestamp: string | null
          root_report_id: string | null
          save_operation_key: string | null
          scoring_engine_version: string | null
          slug: string
          source_mode: string
          source_schema_version: string | null
          source_snapshot_metadata: Json
          status: Database["public"]["Enums"]["report_status"]
          title: string
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "reports"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      kick_analysis_worker: { Args: never; Returns: undefined }
      read_analysis_job_queue: {
        Args: { p_qty?: number; p_vt?: number }
        Returns: {
          job_id: string
          msg_id: number
          read_ct: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "user"
      report_status: "draft" | "in_review" | "approved" | "rejected"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      report_status: ["draft", "in_review", "approved", "rejected"],
    },
  },
} as const
