export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Plan = 'free' | 'plus';
export type MemoryMode = 'remember' | 'reply_only' | 'private';
export type MemoryCategory = 'theme' | 'person_pattern' | 'value_goal' | 'what_helps' | 'trigger' | 'preference';
export type MemoryStatus = 'active' | 'user_edited' | 'dismissed';
export type ReplyKind = 'normal' | 'safety';
export type UsageKind = 'reply' | 'safety' | 'extract' | 'memory' | 'report';
export type ReportKind = 'weekly' | 'monthly';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          plan: string;
          plan_expires_at: string | null;
          default_memory_mode: string;
          consent_ai_at: string | null;
          consent_sensitive_at: string | null;
          consent_overseas_at: string | null;
          timezone: string;
          reminder_time: string | null;
          onboarding_state: Json;
          nickname: string | null;
          birth_date: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          plan?: string;
          plan_expires_at?: string | null;
          default_memory_mode?: string;
          consent_ai_at?: string | null;
          consent_sensitive_at?: string | null;
          consent_overseas_at?: string | null;
          timezone?: string;
          reminder_time?: string | null;
          onboarding_state?: Json;
          nickname?: string | null;
          birth_date?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          plan?: string;
          plan_expires_at?: string | null;
          default_memory_mode?: string;
          consent_ai_at?: string | null;
          consent_sensitive_at?: string | null;
          consent_overseas_at?: string | null;
          timezone?: string;
          reminder_time?: string | null;
          onboarding_state?: Json;
          nickname?: string | null;
          birth_date?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      entries: {
        Row: {
          id: string;
          user_id: string;
          entry_date: string;
          title: string | null;
          content: string;
          mood: number | null;
          memory_mode: string;
          prompt_used: string | null;
          safety_flag: boolean;
          memory_processed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          entry_date: string;
          title?: string | null;
          content: string;
          mood?: number | null;
          memory_mode?: string;
          prompt_used?: string | null;
          safety_flag?: boolean;
          memory_processed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          entry_date?: string;
          title?: string | null;
          content?: string;
          mood?: number | null;
          memory_mode?: string;
          prompt_used?: string | null;
          safety_flag?: boolean;
          memory_processed_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      replies: {
        Row: {
          id: string;
          entry_id: string;
          user_id: string;
          content: string;
          kind: string;
          model: string;
          prompt_version: string;
          input_tokens: number;
          output_tokens: number;
          cache_read_tokens: number;
          rating: number | null;
          memory_notes: string[];
          created_at: string;
        };
        Insert: {
          id?: string;
          entry_id: string;
          user_id: string;
          content: string;
          kind: string;
          model: string;
          prompt_version: string;
          input_tokens?: number;
          output_tokens?: number;
          cache_read_tokens?: number;
          rating?: number | null;
          memory_notes?: string[];
          created_at?: string;
        };
        Update: {
          rating?: number | null;
          memory_notes?: string[];
        };
        Relationships: [];
      };
      entry_insights: {
        Row: {
          entry_id: string;
          user_id: string;
          summary: string;
          emotions: Json;
          people: string[];
          topics: string[];
          events: string[];
          coping: string[];
          created_at: string;
        };
        Insert: {
          entry_id: string;
          user_id: string;
          summary?: string;
          emotions?: Json;
          people?: string[];
          topics?: string[];
          events?: string[];
          coping?: string[];
          created_at?: string;
        };
        Update: {
          summary?: string;
          emotions?: Json;
          people?: string[];
          topics?: string[];
          events?: string[];
          coping?: string[];
        };
        Relationships: [];
      };
      people: {
        Row: {
          id: string;
          user_id: string;
          display_name: string;
          aliases: string[];
          relation: string | null;
          notes: string | null;
          mention_count: number;
          last_mentioned_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          display_name: string;
          aliases?: string[];
          relation?: string | null;
          notes?: string | null;
          mention_count?: number;
          last_mentioned_at?: string | null;
        };
        Update: {
          display_name?: string;
          aliases?: string[];
          relation?: string | null;
          notes?: string | null;
          mention_count?: number;
          last_mentioned_at?: string | null;
        };
        Relationships: [];
      };
      memory_items: {
        Row: {
          id: string;
          user_id: string;
          category: string;
          content: string;
          evidence_entry_ids: string[];
          confidence: number;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          category: string;
          content: string;
          evidence_entry_ids?: string[];
          confidence?: number;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          category?: string;
          content?: string;
          evidence_entry_ids?: string[];
          confidence?: number;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      reports: {
        Row: {
          id: string;
          user_id: string;
          kind: string;
          period_start: string;
          period_end: string;
          content: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          kind: string;
          period_start: string;
          period_end: string;
          content?: Json;
          created_at?: string;
        };
        Update: {
          content?: Json;
        };
        Relationships: [];
      };
      usage_events: {
        Row: {
          id: string;
          user_id: string;
          kind: string;
          model: string;
          input_tokens: number;
          output_tokens: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          kind: string;
          model: string;
          input_tokens?: number;
          output_tokens?: number;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
  };
}

// Convenience row types derived from Database
export type ProfileRow = Database['public']['Tables']['profiles']['Row'];
export type EntryRow = Database['public']['Tables']['entries']['Row'];
export type ReplyRow = Database['public']['Tables']['replies']['Row'];
export type EntryInsightRow = Database['public']['Tables']['entry_insights']['Row'];
export type PersonRow = Database['public']['Tables']['people']['Row'];
export type MemoryItemRow = Database['public']['Tables']['memory_items']['Row'];
export type ReportRow = Database['public']['Tables']['reports']['Row'];
