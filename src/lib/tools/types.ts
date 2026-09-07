import type { z } from "zod";
import type { Database } from "@/lib/supabase/types";

type Workspace = Database["public"]["Tables"]["workspaces"]["Row"];
type Contact = Database["public"]["Tables"]["contacts"]["Row"];
type Conversation = Database["public"]["Tables"]["conversations"]["Row"];

export interface ToolContext {
  workspace: Workspace;
  conversation: Conversation;
  contact: Contact;
  /** Per-workspace tool credentials/config, from `tool_configs`. */
  credentials: Record<string, unknown>;
}

export interface ToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

// One interface for every tool the agent can call — KB search, HighLevel,
// scheduling, Supabase lookups, or a workspace's own `custom_webhook` —
// so the agent runtime never needs to know which kind it's calling.
export interface Tool<Args = unknown> {
  name: string;
  description: string;
  schema: z.ZodType<Args>;
  enabledFor(workspace: Workspace, credentials: Record<string, unknown>): boolean;
  run(args: Args, ctx: ToolContext): Promise<ToolResult>;
}
