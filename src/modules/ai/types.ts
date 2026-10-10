/** AI gateway types shared by the server and browser code (no database imports). */

/** "anthropic" is the Messages API; "openai" is any OpenAI-compatible Chat Completions API. */
export const AI_PROVIDER_KINDS = ["anthropic", "openai"] as const;
export type AiProviderKind = (typeof AI_PROVIDER_KINDS)[number];

export type AiPreset = {
  id: string;
  label: string;
  kind: AiProviderKind;
  /** Empty when the address comes from the provider's own dashboard. */
  baseUrl: string;
  /** Model ids known to exist; the admin can load the provider's live list instead. */
  models: string[];
};

export const AI_PRESETS: AiPreset[] = [
  { id: "anthropic", label: "Anthropic (Claude)", kind: "anthropic", baseUrl: "https://api.anthropic.com", models: ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5", "claude-fable-5-1"] },
  { id: "openai", label: "OpenAI", kind: "openai", baseUrl: "https://api.openai.com/v1", models: [] },
  { id: "deepseek", label: "DeepSeek", kind: "openai", baseUrl: "https://api.deepseek.com/v1", models: ["deepseek-chat", "deepseek-reasoner"] },
  { id: "gemini", label: "Google Gemini", kind: "openai", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", models: [] },
  { id: "openrouter", label: "OpenRouter", kind: "openai", baseUrl: "https://openrouter.ai/api/v1", models: [] },
  { id: "groq", label: "Groq", kind: "openai", baseUrl: "https://api.groq.com/openai/v1", models: [] },
  { id: "netra", label: "Netra Runtime (Netra Cloud)", kind: "openai", baseUrl: "", models: [] },
  { id: "custom", label: "OpenAI-compatible", kind: "openai", baseUrl: "", models: [] },
];

export function presetById(id: string): AiPreset | undefined {
  return AI_PRESETS.find((preset) => preset.id === id);
}

export type AiProviderConfig = {
  id: string;
  preset: string;
  kind: AiProviderKind;
  label: string;
  baseUrl: string;
  /** Write-only: never sent to the browser. */
  apiKey: string | null;
  /** Models offered to people; the first is used when none is chosen. */
  models: string[];
  enabled: boolean;
};

export type AiConfig = { providers: AiProviderConfig[]; defaultProviderId: string | null; defaultModel: string | null };

/** "platform": AkunMu's providers within the plan's monthly quota; "own": the tenant's own key (BYOK), no quota. */
export const TENANT_AI_MODES = ["platform", "own"] as const;
export type TenantAiMode = (typeof TENANT_AI_MODES)[number];
export type TenantAiConfig = AiConfig & { mode: TenantAiMode };

/** Monthly AI messages per tenant on the platform's providers: a default, a trial default and per-tenant overrides. */
export type AiQuotaConfig = { monthly: number; trialMonthly: number; byTenant: Record<string, number> };
export const DEFAULT_AI_QUOTAS: AiQuotaConfig = { monthly: 300, trialMonthly: 50, byTenant: {} };

// ----- chat messages, provider-neutral -----

/** A tool the model may call; `parameters` is a JSON Schema object. */
export type AiToolSpec = { name: string; description: string; parameters: Record<string, unknown> };
export type AiToolCall = { id: string; name: string; input: Record<string, unknown> };
export type AiToolResult = { callId: string; name: string; content: string; isError?: boolean };

/**
 * Parts of an assistant reply that must go back to the same provider unchanged while its tool loop runs:
 * Anthropic's content blocks with their (encrypted) thinking, or the `reasoning_content` of OpenAI-compatible
 * reasoning models such as DeepSeek.
 */
export type AiProviderState = { kind: "anthropic"; blocks: Record<string, unknown>[] } | { kind: "openai"; reasoning: string };

export type AiTurn =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: AiToolCall[]; providerState?: AiProviderState | null }
  | { role: "tool"; results: AiToolResult[] };

/** How much work the model puts into a reply (Anthropic `output_config.effort`; ignored where unsupported). */
export type AiEffort = "low" | "medium" | "high";

/**
 * Asks for a JSON reply matching `schema`: structured outputs where the provider has them, JSON mode or the
 * prompt alone elsewhere, so callers still parse and validate the text. Every object in the schema needs
 * `additionalProperties: false` and lists all its properties as required (nullable ones use anyOf with null);
 * no length or range keywords.
 */
export type AiJsonFormat = { name: string; schema: Record<string, unknown> };

export type AiChatRequest = {
  system?: string;
  turns: AiTurn[];
  tools?: AiToolSpec[];
  model: string;
  /** Hard cap on output, thinking included on reasoning models. */
  maxTokens?: number;
  /** Rejected by Claude 5.x models (400) when not the default: leave it out for them. */
  temperature?: number;
  effort?: AiEffort;
  json?: AiJsonFormat;
  /** How long to wait for the provider (default 90 s). */
  timeoutMs?: number;
};
export type AiChatResult = {
  text: string;
  toolCalls: AiToolCall[];
  usage: { inputTokens: number; outputTokens: number };
  stopReason: string;
  providerState?: AiProviderState | null;
};
