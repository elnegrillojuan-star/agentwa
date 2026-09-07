// Hand-written to match supabase/migrations/0001_init.sql.
// Once the project is linked, replace with `supabase gen types typescript`.
//
// Deliberately spells out each Row/Insert/Update as a plain object literal
// (no Partial<>/Pick<> helpers): this version of @supabase/supabase-js
// resolves the active schema via `Database[SchemaName] extends GenericSchema
// ? ... : never`, and a mapped-type intersection (e.g. `Partial<Row> &
// Pick<Row, K>`) doesn't satisfy that structural check the way a plain
// literal does — it silently collapses every query result to `never`
// instead of erroring. Matches what `supabase gen types` itself emits.

export type WorkspaceRole = "admin" | "manager" | "agent" | "viewer";
export type ConversationStatus =
  | "ai_active"
  | "human_active"
  | "handoff_pending"
  | "awaiting_user"
  | "snoozed"
  | "closed";
export type MessageDirection = "inbound" | "outbound";
export type MessageSender = "contact" | "ai" | "human";
export type TemplateStatus = "draft" | "submitted" | "approved" | "rejected" | "paused";

export interface Database {
  // Required by @supabase/supabase-js so PostgREST-version-gated features
  // (e.g. `.maxAffected()`) type-check correctly.
  __InternalSupabase: {
    PostgrestVersion: "13";
  };
  public: {
    Tables: {
      workspaces: {
        Row: {
          id: string;
          name: string;
          slug: string;
          ycloud_api_key: string | null;
          ycloud_webhook_secret: string | null;
          ycloud_whatsapp_number: string | null;
          openrouter_api_key: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          ycloud_api_key?: string | null;
          ycloud_webhook_secret?: string | null;
          ycloud_whatsapp_number?: string | null;
          openrouter_api_key?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          ycloud_api_key?: string | null;
          ycloud_webhook_secret?: string | null;
          ycloud_whatsapp_number?: string | null;
          openrouter_api_key?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      workspace_members: {
        Row: {
          workspace_id: string;
          user_id: string;
          role: WorkspaceRole;
          created_at: string;
        };
        Insert: {
          workspace_id: string;
          user_id: string;
          role?: WorkspaceRole;
          created_at?: string;
        };
        Update: {
          workspace_id?: string;
          user_id?: string;
          role?: WorkspaceRole;
          created_at?: string;
        };
        Relationships: [];
      };
      contacts: {
        Row: {
          id: string;
          workspace_id: string;
          phone: string;
          name: string | null;
          email: string | null;
          source: string | null;
          owner_id: string | null;
          tags: string[];
          custom_fields: Record<string, unknown>;
          stage: string | null;
          highlevel_contact_id: string | null;
          opted_in: boolean;
          last_interaction_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          phone: string;
          name?: string | null;
          email?: string | null;
          source?: string | null;
          owner_id?: string | null;
          tags?: string[];
          custom_fields?: Record<string, unknown>;
          stage?: string | null;
          highlevel_contact_id?: string | null;
          opted_in?: boolean;
          last_interaction_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          phone?: string;
          name?: string | null;
          email?: string | null;
          source?: string | null;
          owner_id?: string | null;
          tags?: string[];
          custom_fields?: Record<string, unknown>;
          stage?: string | null;
          highlevel_contact_id?: string | null;
          opted_in?: boolean;
          last_interaction_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      conversations: {
        Row: {
          id: string;
          workspace_id: string;
          contact_id: string;
          status: ConversationStatus;
          assigned_to: string | null;
          window_expires_at: string | null;
          channel: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          contact_id: string;
          status?: ConversationStatus;
          assigned_to?: string | null;
          window_expires_at?: string | null;
          channel?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          contact_id?: string;
          status?: ConversationStatus;
          assigned_to?: string | null;
          window_expires_at?: string | null;
          channel?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          workspace_id: string;
          conversation_id: string;
          direction: MessageDirection;
          sender: MessageSender;
          type: string;
          body: string | null;
          media_url: string | null;
          wamid: string | null;
          batch_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          conversation_id: string;
          direction: MessageDirection;
          sender: MessageSender;
          type?: string;
          body?: string | null;
          media_url?: string | null;
          wamid?: string | null;
          batch_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          conversation_id?: string;
          direction?: MessageDirection;
          sender?: MessageSender;
          type?: string;
          body?: string | null;
          media_url?: string | null;
          wamid?: string | null;
          batch_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      prompts: {
        Row: {
          id: string;
          workspace_id: string;
          scope: string;
          scope_ref: string | null;
          content: string;
          is_published: boolean;
          version: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          scope?: string;
          scope_ref?: string | null;
          content: string;
          is_published?: boolean;
          version?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          scope?: string;
          scope_ref?: string | null;
          content?: string;
          is_published?: boolean;
          version?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      tool_configs: {
        Row: {
          id: string;
          workspace_id: string;
          tool_name: string;
          enabled: boolean;
          credentials: Record<string, unknown>;
          config: Record<string, unknown>;
          created_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          tool_name: string;
          enabled?: boolean;
          credentials?: Record<string, unknown>;
          config?: Record<string, unknown>;
          created_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          tool_name?: string;
          enabled?: boolean;
          credentials?: Record<string, unknown>;
          config?: Record<string, unknown>;
          created_at?: string;
        };
        Relationships: [];
      };
      templates: {
        Row: {
          id: string;
          workspace_id: string;
          name: string;
          language: string;
          status: TemplateStatus;
          category: string | null;
          components: unknown[];
          meta_template_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          name: string;
          language?: string;
          status?: TemplateStatus;
          category?: string | null;
          components?: unknown[];
          meta_template_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          name?: string;
          language?: string;
          status?: TemplateStatus;
          category?: string | null;
          components?: unknown[];
          meta_template_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
