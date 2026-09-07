import { chatCompletion, type ChatMessage } from "@/lib/openrouter/client";
import { createServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/lib/supabase/types";
import { getEnabledTools, runTool, toOpenRouterTools } from "@/lib/tools/registry";
import type { ToolContext } from "@/lib/tools/types";

type Workspace = Database["public"]["Tables"]["workspaces"]["Row"];
type Contact = Database["public"]["Tables"]["contacts"]["Row"];
type Conversation = Database["public"]["Tables"]["conversations"]["Row"];

const DEFAULT_SYSTEM_PROMPT =
  "Eres un asistente de atención por WhatsApp. Responde en español, de forma breve y clara. " +
  "Si no tienes información suficiente para responder con certeza, dilo en vez de inventar datos.";

const DEFAULT_MODEL = process.env.OPENROUTER_DEFAULT_MODEL ?? "openai/gpt-4o-mini";
const HISTORY_LIMIT = 20;
const MAX_TOOL_ROUNDS = 3;

async function getSystemPrompt(
  supabase: ReturnType<typeof createServiceClient>,
  workspaceId: string,
): Promise<string> {
  const { data } = await supabase
    .from("prompts")
    .select("content")
    .eq("workspace_id", workspaceId)
    .eq("scope", "workspace")
    .eq("is_published", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.content ?? DEFAULT_SYSTEM_PROMPT;
}

async function getHistory(
  supabase: ReturnType<typeof createServiceClient>,
  conversationId: string,
): Promise<ChatMessage[]> {
  const { data } = await supabase
    .from("messages")
    .select("sender, direction, body, type")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);

  return (data ?? [])
    .reverse()
    .filter((m) => m.type === "text" && m.body)
    .map((m) => ({
      role: m.direction === "inbound" ? "user" : "assistant",
      content: m.body as string,
    }));
}

interface RespondParams {
  workspace: Workspace;
  conversation: Conversation;
  contact: Contact;
  userMessage: string;
}

// Day-1 happy path: no buffer yet, single incoming text message straight to
// the model. Buffering (BRIEF §2), handoff (§3), and window/template
// enforcement (§10) are added as layers on top of this.
export async function respondToMessage({
  workspace,
  conversation,
  contact,
  userMessage,
}: RespondParams): Promise<string> {
  if (!workspace.openrouter_api_key) {
    throw new Error(`Workspace ${workspace.id} has no OpenRouter API key configured`);
  }

  const supabase = createServiceClient();

  const [systemPrompt, history, { data: toolConfigRows }] = await Promise.all([
    getSystemPrompt(supabase, workspace.id),
    getHistory(supabase, conversation.id),
    supabase
      .from("tool_configs")
      .select("tool_name, enabled, credentials")
      .eq("workspace_id", workspace.id),
  ]);

  const toolConfigsByName = Object.fromEntries(
    (toolConfigRows ?? [])
      .filter((row) => row.enabled)
      .map((row) => [row.tool_name, row.credentials as Record<string, unknown>]),
  );
  const tools = getEnabledTools(workspace, toolConfigsByName);

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: userMessage },
  ];

  const toolCtx: ToolContext = {
    workspace,
    conversation,
    contact,
    credentials: {},
  };

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const result = await chatCompletion({
      apiKey: workspace.openrouter_api_key,
      model: DEFAULT_MODEL,
      messages,
      tools: toOpenRouterTools(tools),
    });

    if (result.toolCalls.length === 0) {
      return result.content ?? "";
    }

    messages.push({
      role: "assistant",
      content: result.content ?? "",
      tool_calls: result.toolCalls,
    });

    for (const call of result.toolCalls) {
      const toolResult = await runTool(
        tools,
        call.function.name,
        call.function.arguments,
        toolCtx,
      );
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(toolResult),
      });
    }
  }

  return "Disculpa, no pude procesar tu mensaje en este momento. Un miembro del equipo te va a responder pronto.";
}
