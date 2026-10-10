import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aiConfigInputSchema, aiQuotaInputSchema, clearAiConfigCache, loadPlatformAi, saveAiQuotas, savePlatformAi, saveTenantAi, tenantAiInputSchema } from "@/modules/ai/config";
import { aiUsageSummary, resolveAi, runAiChat, startAiMessage } from "@/modules/ai/gateway";
import type { AiTurn } from "@/modules/ai/types";
import { inTenant, type Database } from "@/shared/db";
import { createTestTenant, openTestDatabase } from "../helpers/database";
import { staffUser } from "../helpers/fixtures";

let close: () => Promise<void>;
let owner: Database;
let requests: { url: string; headers: Headers; body: Record<string, unknown> }[];
let reply: (url: string) => Response;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(async () => {
  ({ close, owner } = await openTestDatabase());
  clearAiConfigCache();
  requests = [];
  reply = () => json(200, {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      requests.push({ url, headers: new Headers(init?.headers), body: init?.body ? JSON.parse(String(init.body)) : {} });
      return reply(url);
    }),
  );
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await close();
});

const anthropic = { preset: "anthropic", kind: "anthropic", label: "Claude", baseUrl: "https://api.anthropic.test", apiKey: "sk-ant-platform", models: ["claude-haiku-4-5-20251001"] };
const deepseek = { preset: "deepseek", kind: "openai", label: "DeepSeek", baseUrl: "https://api.deepseek.test/v1", apiKey: "sk-tenant", models: ["deepseek-chat"] };

async function setupPlatform(actorId: number) {
  return savePlatformAi(aiConfigInputSchema.parse({ providers: [anthropic] }), actorId);
}

describe("AI gateway", () => {
  it("keeps API keys write-only and keeps a stored key when the field is left empty", async () => {
    const admin = await staffUser();
    const masked = await setupPlatform(admin.id);
    expect(masked.providers[0]).toMatchObject({ label: "Claude", apiKey: null, hasKey: true });

    await savePlatformAi(aiConfigInputSchema.parse({ providers: [{ ...anthropic, id: masked.providers[0].id, apiKey: "", label: "Claude Haiku" }] }), admin.id);
    const stored = await loadPlatformAi();
    expect(stored.providers[0]).toMatchObject({ label: "Claude Haiku", apiKey: "sk-ant-platform" });
  });

  it("uses the platform's provider, or the tenant's own key when it chose one", async () => {
    const admin = await staffUser();
    await expect(resolveAi()).rejects.toMatchObject({ status: 409, messageKey: "errors.aiNotConfigured" });
    await setupPlatform(admin.id);
    expect(await resolveAi()).toMatchObject({ source: "platform", model: "claude-haiku-4-5-20251001" });

    await saveTenantAi(tenantAiInputSchema.parse({ mode: "own", providers: [deepseek] }), admin.id);
    expect(await resolveAi()).toMatchObject({ source: "own", model: "deepseek-chat", provider: { label: "DeepSeek" } });

    // Another tenant keeps using the platform's provider.
    const other = await createTestTenant(owner, "other");
    clearAiConfigCache();
    expect(await inTenant(other, () => resolveAi())).toMatchObject({ source: "platform" });
  });

  it("stops at the monthly quota on the platform's providers but not with an own key", async () => {
    const admin = await staffUser();
    await setupPlatform(admin.id);
    await saveAiQuotas(aiQuotaInputSchema.parse({ monthly: 2, trialMonthly: 2 }), admin.id);
    await startAiMessage();
    await startAiMessage();
    await expect(startAiMessage()).rejects.toMatchObject({ status: 429, messageKey: "errors.aiQuotaExceeded" });
    expect(await aiUsageSummary()).toMatchObject({ requests: 2, limit: 2, source: "platform" });

    await saveTenantAi(tenantAiInputSchema.parse({ mode: "own", providers: [deepseek] }), admin.id);
    await expect(startAiMessage()).resolves.toMatchObject({ source: "own" });
  });

  it("speaks the Anthropic Messages API with tools and records the tokens", async () => {
    const admin = await staffUser();
    await setupPlatform(admin.id);
    reply = () =>
      json(200, {
        content: [
          { type: "text", text: "Let me check." },
          { type: "tool_use", id: "toolu_1", name: "list_devices", input: { status: "published" } },
        ],
        usage: { input_tokens: 120, output_tokens: 30 },
        stop_reason: "tool_use",
      });
    const resolved = await startAiMessage();
    const result = await runAiChat(resolved, {
      system: "You help people track their sign-ins.",
      turns: [
        { role: "user", content: "Which devices do I have?" },
        { role: "assistant", content: "", toolCalls: [{ id: "toolu_0", name: "list_devices", input: {} }] },
        { role: "tool", results: [{ callId: "toolu_0", name: "list_devices", content: "[]" }] },
      ],
      tools: [{ name: "list_devices", description: "Lists devices", parameters: { type: "object", properties: {} } }],
    });

    expect(result).toMatchObject({ text: "Let me check.", toolCalls: [{ id: "toolu_1", name: "list_devices", input: { status: "published" } }] });
    const [call] = requests;
    expect(call.url).toBe("https://api.anthropic.test/v1/messages");
    expect(call.headers.get("x-api-key")).toBe("sk-ant-platform");
    expect(call.body).toMatchObject({ model: "claude-haiku-4-5-20251001", system: "You help people track their sign-ins.", tools: [{ name: "list_devices", input_schema: { type: "object" } }] });
    expect((call.body.messages as unknown[])[2]).toEqual({ role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_0", content: "[]" }] });
    expect(await aiUsageSummary()).toMatchObject({ requests: 1, inputTokens: 120, outputTokens: 30 });
  });

  it("speaks OpenAI-compatible Chat Completions with tool calls", async () => {
    const admin = await staffUser();
    await saveTenantAi(tenantAiInputSchema.parse({ mode: "own", providers: [deepseek] }), admin.id);
    reply = () =>
      json(200, {
        choices: [{ message: { content: null, tool_calls: [{ id: "call_1", function: { name: "get_device", arguments: "{\"id\":7}" } }] }, finish_reason: "tool_calls" }],
        usage: { prompt_tokens: 80, completion_tokens: 12 },
      });
    const resolved = await startAiMessage();
    const result = await runAiChat(resolved, {
      turns: [
        { role: "user", content: "Device 7 details" },
        { role: "assistant", content: "", toolCalls: [{ id: "call_0", name: "get_device", input: { id: 7 } }] },
        { role: "tool", results: [{ callId: "call_0", name: "get_device", content: "{}" }] },
      ],
      tools: [{ name: "get_device", description: "One device", parameters: { type: "object" } }],
    });

    expect(result.toolCalls).toEqual([{ id: "call_1", name: "get_device", input: { id: 7 } }]);
    const [call] = requests;
    expect(call.url).toBe("https://api.deepseek.test/v1/chat/completions");
    expect(call.headers.get("authorization")).toBe("Bearer sk-tenant");
    const messages = call.body.messages as Record<string, unknown>[];
    expect(messages[1]).toMatchObject({ role: "assistant", tool_calls: [{ id: "call_0", type: "function", function: { name: "get_device", arguments: "{\"id\":7}" } }] });
    expect(messages[2]).toEqual({ role: "tool", tool_call_id: "call_0", content: "{}" });
  });

  it("keeps Claude's thinking blocks for the tool loop and asks for an effort level", async () => {
    const admin = await staffUser();
    await savePlatformAi(aiConfigInputSchema.parse({ providers: [{ ...anthropic, models: ["claude-haiku-5-5"] }] }), admin.id);
    const blocks = [
      { type: "thinking", thinking: "", signature: "sig-1" },
      { type: "tool_use", id: "toolu_9", name: "list_devices", input: {} },
    ];
    reply = () => json(200, { content: blocks, usage: { input_tokens: 10, output_tokens: 5 }, stop_reason: "tool_use" });
    const resolved = await startAiMessage();
    const first = await runAiChat(resolved, { turns: [{ role: "user", content: "Devices?" }], maxTokens: 16_000, effort: "medium" });
    expect(first.providerState).toEqual({ kind: "anthropic", blocks });
    expect(requests[0].body).toMatchObject({ model: "claude-haiku-5-5", max_tokens: 16_000, output_config: { effort: "medium" } });
    expect(requests[0].body).not.toHaveProperty("temperature");

    await runAiChat(resolved, {
      turns: [
        { role: "user", content: "Devices?" },
        { role: "assistant", content: "", toolCalls: first.toolCalls, providerState: first.providerState },
        { role: "tool", results: [{ callId: "toolu_9", name: "list_devices", content: "[]" }] },
      ],
    });
    expect((requests[1].body.messages as unknown[])[1]).toEqual({ role: "assistant", content: blocks });
  });

  it("passes reasoning back inside the tool loop and uses max_completion_tokens on OpenAI", async () => {
    const admin = await staffUser();
    const openai = { preset: "openai", kind: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", apiKey: "sk-openai", models: ["gpt-6-luna"] };
    await saveTenantAi(tenantAiInputSchema.parse({ mode: "own", providers: [deepseek, openai] }), admin.id);
    reply = () => json(200, { choices: [{ message: { content: "ok", reasoning_content: "thinking it over" }, finish_reason: "stop" }], usage: {} });
    const turns: AiTurn[] = [
      { role: "user", content: "Lama" },
      { role: "assistant", content: "", toolCalls: [{ id: "call_a", name: "list_devices", input: {} }], providerState: { kind: "openai", reasoning: "old" } },
      { role: "tool", results: [{ callId: "call_a", name: "list_devices", content: "[]" }] },
      { role: "user", content: "Baru" },
      { role: "assistant", content: "", toolCalls: [{ id: "call_b", name: "list_devices", input: {} }], providerState: { kind: "openai", reasoning: "current" } },
      { role: "tool", results: [{ callId: "call_b", name: "list_devices", content: "[]" }] },
    ];
    const result = await runAiChat(await resolveAi("deepseek-chat"), { turns, maxTokens: 900 });
    expect(result.providerState).toEqual({ kind: "openai", reasoning: "thinking it over" });
    const messages = requests[0].body.messages as Record<string, unknown>[];
    expect(messages[1]).not.toHaveProperty("reasoning_content");
    expect(messages[4]).toMatchObject({ reasoning_content: "current" });
    expect(requests[0].body).toMatchObject({ max_tokens: 900 });

    await runAiChat(await resolveAi("gpt-6-luna"), { turns: [{ role: "user", content: "halo" }], maxTokens: 900 });
    expect(requests[1].url).toBe("https://api.openai.com/v1/chat/completions");
    expect(requests[1].body).toMatchObject({ max_completion_tokens: 900 });
    expect(requests[1].body).not.toHaveProperty("max_tokens");
  });

  it("turns a provider failure into a translated error", async () => {
    const admin = await staffUser();
    await setupPlatform(admin.id);
    reply = () => json(401, { error: { message: "invalid x-api-key" } });
    const resolved = await startAiMessage();
    await expect(runAiChat(resolved, { turns: [{ role: "user", content: "halo" }] })).rejects.toMatchObject({ status: 502, messageKey: "errors.aiProviderFailed" });
  });
});
