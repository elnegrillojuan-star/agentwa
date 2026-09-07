export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: OpenRouterToolCall[];
}

export interface OpenRouterToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface OpenRouterTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface ChatCompletionParams {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  tools?: OpenRouterTool[];
  temperature?: number;
  maxTokens?: number;
}

interface ChatCompletionResult {
  content: string | null;
  toolCalls: OpenRouterToolCall[];
  usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null;
}

export async function chatCompletion({
  apiKey,
  model,
  messages,
  tools,
  temperature = 0.4,
  maxTokens,
}: ChatCompletionParams): Promise<ChatCompletionResult> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      ...(tools && tools.length > 0 ? { tools, tool_choice: "auto" } : {}),
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenRouter request failed (${res.status}): ${detail}`);
  }

  const data = await res.json();
  const choice = data.choices?.[0];
  const message = choice?.message ?? {};

  return {
    content: message.content ?? null,
    toolCalls: message.tool_calls ?? [],
    usage: data.usage
      ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        }
      : null,
  };
}
