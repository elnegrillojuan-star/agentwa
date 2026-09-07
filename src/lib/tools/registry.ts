import { z } from "zod";
import type { OpenRouterTool } from "@/lib/openrouter/client";
import type { Database } from "@/lib/supabase/types";
import { obtenerInfoCliente } from "./obtener-info-cliente";
import type { Tool, ToolContext, ToolResult } from "./types";

type Workspace = Database["public"]["Tables"]["workspaces"]["Row"];

// All tools the agent runtime knows about. Adding a workspace-specific
// integration (n8n, Make, a custom API) means adding a `custom_webhook`
// row in `tool_configs`, not a new entry here.
const ALL_TOOLS: Tool[] = [obtenerInfoCliente];

export function getEnabledTools(
  workspace: Workspace,
  toolConfigsByName: Record<string, Record<string, unknown>>,
): Tool[] {
  return ALL_TOOLS.filter((tool) =>
    tool.enabledFor(workspace, toolConfigsByName[tool.name] ?? {}),
  );
}

export function toOpenRouterTools(tools: Tool[]): OpenRouterTool[] {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: z.toJSONSchema(tool.schema) as Record<string, unknown>,
    },
  }));
}

export async function runTool(
  tools: Tool[],
  name: string,
  rawArgs: string,
  ctx: ToolContext,
): Promise<ToolResult> {
  const tool = tools.find((t) => t.name === name);
  if (!tool) {
    return { ok: false, error: `Unknown tool: ${name}` };
  }

  let parsedArgs: unknown;
  try {
    parsedArgs = JSON.parse(rawArgs || "{}");
  } catch {
    return { ok: false, error: "Tool arguments were not valid JSON" };
  }

  const validated = tool.schema.safeParse(parsedArgs);
  if (!validated.success) {
    return { ok: false, error: validated.error.message };
  }

  try {
    return await tool.run(validated.data, ctx);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Tool execution failed" };
  }
}
