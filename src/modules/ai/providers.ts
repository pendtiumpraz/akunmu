import type { AiChatRequest, AiChatResult, AiJsonFormat, AiProviderConfig, AiProviderState, AiToolCall, AiTurn } from "./types";

const TIMEOUT_MS = 90_000;
const ANTHROPIC_VERSION = "2023-06-01";

/** A provider answered with an error, or could not be reached (status 0). The message is the provider's own. */
export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}

function endpoint(provider: AiProviderConfig, path: string): string {
  if (!provider.baseUrl) throw new AiProviderError("The provider has no API address.", 0);
  return `${provider.baseUrl.replace(/\/+$/, "")}${path}`;
}

async function send(url: string, init: RequestInit, timeoutMs: number = TIMEOUT_MS): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    throw new AiProviderError(error instanceof Error ? error.message : "network error", 0);
  }
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    const detail = (body as { error?: { message?: string } | string } | null)?.error;
    const message = typeof detail === "string" ? detail : detail?.message ?? (typeof body === "string" ? body.slice(0, 300) : `HTTP ${response.status}`);
    throw new AiProviderError(message, response.status);
  }
  return body;
}

// ----- Anthropic Messages API -----

type AnthropicMessage = { role: "user" | "assistant"; content: string | Record<string, unknown>[] };

function contentBlocks(content: AnthropicMessage["content"]): Record<string, unknown>[] {
  return typeof content === "string" ? [{ type: "text", text: content }] : content;
}

/** Turns of the same role in a row (tool results followed by a new question) become one message. */
function anthropicMessages(turns: AiTurn[]): AnthropicMessage[] {
  const messages: AnthropicMessage[] = [];
  const push = (message: AnthropicMessage) => {
    const last = messages.at(-1);
    if (last && last.role === message.role) last.content = [...contentBlocks(last.content), ...contentBlocks(message.content)];
    else messages.push(message);
  };
  for (const turn of turns) {
    if (turn.role === "user") push({ role: "user", content: turn.content });
    else if (turn.role === "assistant" && turn.providerState?.kind === "anthropic" && turn.providerState.blocks.length > 0) {
      // Thinking blocks go back complete and in their original order, as the tool loop requires.
      push({ role: "assistant", content: turn.providerState.blocks });
    } else if (turn.role === "assistant") {
      const blocks: Record<string, unknown>[] = [];
      if (turn.content) blocks.push({ type: "text", text: turn.content });
      for (const call of turn.toolCalls ?? []) blocks.push({ type: "tool_use", id: call.id, name: call.name, input: call.input });
      if (blocks.length > 0) push({ role: "assistant", content: blocks });
    } else {
      push({
        role: "user",
        content: turn.results.map((result) => ({ type: "tool_result", tool_use_id: result.callId, content: result.content, ...(result.isError ? { is_error: true } : {}) })),
      });
    }
  }
  return messages;
}

/** Models that take `output_config.effort` (Claude 5.x, Opus 4.5+, Sonnet 4.6+); others reject it. */
const EFFORT_MODELS = /^claude-(?:fable|mythos)-|^claude-(?:opus|sonnet|haiku)-5|^claude-opus-4-[5-9]|^claude-sonnet-4-[6-9]/;

export function supportsEffort(model: string): boolean {
  return EFFORT_MODELS.test(model);
}

/** Models that take structured outputs (`output_config.format`); other models get the schema in the prompt only. */
const STRUCTURED_OUTPUT_MODELS = /^claude-(?:fable|mythos)-|^claude-(?:opus|sonnet|haiku)-5|^claude-opus-4-[1-9]|^claude-sonnet-4-[5-9]|^claude-haiku-4-5/;

export function supportsStructuredOutput(model: string): boolean {
  return STRUCTURED_OUTPUT_MODELS.test(model);
}

const THINKING_BLOCKS = new Set(["thinking", "redacted_thinking"]);

function anthropicOutputConfig(request: AiChatRequest): Record<string, unknown> | null {
  const config: Record<string, unknown> = {};
  if (request.effort && supportsEffort(request.model)) config.effort = request.effort;
  if (request.json && supportsStructuredOutput(request.model)) config.format = { type: "json_schema", schema: request.json.schema };
  return Object.keys(config).length > 0 ? config : null;
}

async function anthropicChat(provider: AiProviderConfig, request: AiChatRequest): Promise<AiChatResult> {
  const outputConfig = anthropicOutputConfig(request);
  const body = (await send(
    endpoint(provider, "/v1/messages"),
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": provider.apiKey ?? "", "anthropic-version": ANTHROPIC_VERSION },
      body: JSON.stringify({
        model: request.model,
        max_tokens: request.maxTokens ?? 2048,
        ...(request.system ? { system: request.system } : {}),
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
        ...(outputConfig ? { output_config: outputConfig } : {}),
        messages: anthropicMessages(request.turns),
        ...(request.tools?.length ? { tools: request.tools.map((tool) => ({ name: tool.name, description: tool.description, input_schema: tool.parameters })) } : {}),
      }),
    },
    request.timeoutMs,
  )) as {
    content?: { type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }[];
    usage?: { input_tokens?: number; output_tokens?: number };
    stop_reason?: string;
  };
  const blocks = body.content ?? [];
  const thinks = blocks.some((block) => THINKING_BLOCKS.has(block.type));
  return {
    text: blocks.filter((block) => block.type === "text").map((block) => block.text ?? "").join(""),
    toolCalls: blocks
      .filter((block) => block.type === "tool_use")
      .map((block): AiToolCall => ({ id: block.id ?? "", name: block.name ?? "", input: block.input ?? {} })),
    usage: { inputTokens: body.usage?.input_tokens ?? 0, outputTokens: body.usage?.output_tokens ?? 0 },
    stopReason: body.stop_reason ?? "",
    providerState: thinks ? { kind: "anthropic", blocks: blocks as Record<string, unknown>[] } : null,
  };
}

// ----- OpenAI-compatible Chat Completions -----

function openaiMessages(request: AiChatRequest) {
  const messages: Record<string, unknown>[] = [];
  if (request.system) messages.push({ role: "system", content: request.system });
  // Reasoning goes back only inside the running tool loop (after the latest question), as DeepSeek expects.
  const lastQuestion = request.turns.map((turn) => turn.role).lastIndexOf("user");
  request.turns.forEach((turn, index) => {
    if (turn.role === "user") messages.push({ role: "user", content: turn.content });
    else if (turn.role === "assistant") {
      const reasoning = index > lastQuestion && turn.providerState?.kind === "openai" ? turn.providerState.reasoning : "";
      messages.push({
        role: "assistant",
        content: turn.content || null,
        ...(reasoning ? { reasoning_content: reasoning } : {}),
        ...(turn.toolCalls?.length
          ? { tool_calls: turn.toolCalls.map((call) => ({ id: call.id, type: "function", function: { name: call.name, arguments: JSON.stringify(call.input) } })) }
          : {}),
      });
    } else {
      for (const result of turn.results) messages.push({ role: "tool", tool_call_id: result.callId, content: result.content });
    }
  });
  return messages;
}

function hostOf(provider: AiProviderConfig): string {
  try {
    return new URL(provider.baseUrl).hostname;
  } catch {
    return "";
  }
}

/** OpenAI's own API wants max_completion_tokens (its reasoning models reject max_tokens); compatible APIs take max_tokens. */
function tokenLimit(provider: AiProviderConfig, limit: number): Record<string, number> {
  return hostOf(provider) === "api.openai.com" ? { max_completion_tokens: limit } : { max_tokens: limit };
}

/** Providers documented to accept `response_format: {type: "json_object"}`; others may reject unknown fields. */
const JSON_MODE_HOSTS = new Set(["api.deepseek.com", "openrouter.ai", "api.groq.com"]);

/** OpenAI enforces the schema itself; DeepSeek, OpenRouter and Groq only promise valid JSON; the rest go by the prompt. */
function responseFormat(provider: AiProviderConfig, json: AiJsonFormat | undefined): Record<string, unknown> {
  if (!json) return {};
  const host = hostOf(provider);
  if (host === "api.openai.com") return { response_format: { type: "json_schema", json_schema: { name: json.name, schema: json.schema, strict: true } } };
  return JSON_MODE_HOSTS.has(host) ? { response_format: { type: "json_object" } } : {};
}

function newCallId(): string {
  return `call_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

function parseArguments(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  try {
    const value = JSON.parse(String(raw ?? "{}"));
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function openaiChat(provider: AiProviderConfig, request: AiChatRequest): Promise<AiChatResult> {
  const body = (await send(
    endpoint(provider, "/chat/completions"),
    {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${provider.apiKey ?? ""}` },
      body: JSON.stringify({
        model: request.model,
        ...tokenLimit(provider, request.maxTokens ?? 2048),
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
        ...responseFormat(provider, request.json),
        messages: openaiMessages(request),
        ...(request.tools?.length
          ? { tools: request.tools.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.parameters } })) }
          : {}),
      }),
    },
    request.timeoutMs,
  )) as {
    choices?: {
      message?: { content?: string | null; reasoning_content?: string | null; tool_calls?: { id?: string; function?: { name?: string; arguments?: unknown } }[] };
      finish_reason?: string;
    }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const choice = body.choices?.[0];
  const reasoning = choice?.message?.reasoning_content ?? "";
  const providerState: AiProviderState | null = reasoning ? { kind: "openai", reasoning } : null;
  return {
    text: choice?.message?.content ?? "",
    toolCalls: (choice?.message?.tool_calls ?? []).map((call): AiToolCall => ({
      id: call.id || newCallId(),
      name: call.function?.name ?? "",
      input: parseArguments(call.function?.arguments),
    })),
    usage: { inputTokens: body.usage?.prompt_tokens ?? 0, outputTokens: body.usage?.completion_tokens ?? 0 },
    stopReason: choice?.finish_reason ?? "",
    providerState,
  };
}

export function providerChat(provider: AiProviderConfig, request: AiChatRequest): Promise<AiChatResult> {
  return provider.kind === "anthropic" ? anthropicChat(provider, request) : openaiChat(provider, request);
}

/** The provider's live model list (both APIs answer `{data: [{id}]}`). */
export async function providerModels(provider: AiProviderConfig): Promise<string[]> {
  const body = (await send(endpoint(provider, provider.kind === "anthropic" ? "/v1/models" : "/models"), {
    method: "GET",
    headers:
      provider.kind === "anthropic"
        ? { "x-api-key": provider.apiKey ?? "", "anthropic-version": ANTHROPIC_VERSION }
        : { authorization: `Bearer ${provider.apiKey ?? ""}` },
  })) as { data?: { id?: string }[] };
  return (body.data ?? []).map((model) => model.id ?? "").filter(Boolean).sort();
}
