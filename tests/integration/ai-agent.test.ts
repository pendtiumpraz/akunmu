import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accounts } from "@/modules/accounts/schema";
import type { AgentStreamEvent } from "@/modules/ai/agent-types";
import { aiConfigInputSchema, clearAiConfigCache, savePlatformAi } from "@/modules/ai/config";
import { findConversation } from "@/modules/ai/conversations";
import { aiActions } from "@/modules/ai/schema";
import { signIns } from "@/modules/signins/schema";
import type { StaffRole } from "@/modules/users/schema";
import { conversationDetail, declineAction, prepareConfirmation, prepareQuestion, redactSecrets, secretWords, type AgentRun, type AgentSession } from "@/server/agent/runner";
import { inTenant, type Database } from "@/shared/db";
import { i18nFor } from "@/shared/i18n/messages-loader";
import { createTestTenant, openTestDatabase } from "../helpers/database";
import { browserProfile, device, signIn, staffUser } from "../helpers/fixtures";

let close: () => Promise<void>;
let owner: Database;
let db: Database;
let requests: Record<string, unknown>[];
let replies: Response[];

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

const usage = { input_tokens: 12, output_tokens: 4 };
const callTool = (name: string, input: Record<string, unknown>) => json({ content: [{ type: "tool_use", id: "toolu_1", name, input }], usage, stop_reason: "tool_use" });
const say = (text: string) => json({ content: [{ type: "text", text }], usage, stop_reason: "end_turn" });

beforeEach(async () => {
  ({ close, owner, db } = await openTestDatabase());
  clearAiConfigCache();
  requests = [];
  replies = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(init?.body ? JSON.parse(String(init.body)) : {});
      return replies.shift() ?? say("(no reply queued)");
    }),
  );
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await close();
});

async function session(role: StaffRole = "admin"): Promise<AgentSession> {
  const user = await staffUser(role);
  await savePlatformAi(
    aiConfigInputSchema.parse({ providers: [{ preset: "anthropic", kind: "anthropic", label: "Claude", baseUrl: "https://api.anthropic.test", apiKey: "sk-ant-test", models: ["claude-haiku-5-5"] }] }),
    user.id,
  );
  return { staff: { id: user.id, name: user.name, email: user.email, role: user.role }, i18n: await i18nFor("id"), tenantName: "Test workspace" };
}

async function drain(run: AgentRun): Promise<AgentStreamEvent[]> {
  const received: AgentStreamEvent[] = [];
  await run((event) => received.push(event));
  return received;
}

function toolResults(request: Record<string, unknown>) {
  const messages = request.messages as { role: string; content: unknown }[];
  return messages.flatMap((message) => (Array.isArray(message.content) ? (message.content as Record<string, unknown>[]) : [])).filter((block) => block.type === "tool_result");
}

describe("AI agent", () => {
  it("answers where an account is signed in and keeps chats per person and per workspace", async () => {
    const admin = await session();
    const laptop = await device(admin.staff.id, { name: "Office laptop" });
    const work = await browserProfile(laptop.id, admin.staff.id, { name: "Work" });
    await signIn(admin.staff.id, { deviceId: laptop.id, profileId: work.id }, { provider: "google", identifier: "work@example.com" });
    replies.push(callTool("find_account", { query: "work@" }), say("It is signed in on the Office laptop, Chrome Work."));

    const received = await drain(await prepareQuestion(admin, { conversationId: null, text: `Where is work@example.com signed in? @[Office laptop](device:${laptop.id})` }));

    expect(received[0]).toMatchObject({ type: "conversation" });
    expect(received.at(-1)).toMatchObject({ type: "done", state: "complete", usage: { requests: 1 } });
    const tools = (requests[0].tools as { name: string }[]).map((tool) => tool.name);
    expect(tools).toEqual(expect.arrayContaining(["find_account", "get_device", "record_sign_ins", "sign_out", "confirm_sign_ins"]));
    expect(String(requests[0].system)).toContain("Test workspace");
    // The tool result reached the model on the second call.
    const results = JSON.stringify(toolResults(requests[1]));
    expect(results).toContain("Office laptop");
    expect(results).toContain("Work");

    const conversation = received[0].type === "conversation" ? received[0].conversation : null;
    const detail = await conversationDetail(admin.staff.id, conversation!.id);
    expect(detail.messages.map((message) => message.role)).toEqual(["user", "assistant", "assistant"]);
    expect(detail.messages[1].results[0]).toMatchObject({ name: "find_account", ok: true });

    // Another person of the same workspace cannot open it, nor can another workspace.
    const colleague = await staffUser("editor");
    await expect(conversationDetail(colleague.id, conversation!.id)).rejects.toMatchObject({ status: 404 });
    const other = await createTestTenant(owner, "other");
    expect(await inTenant(other, () => findConversation(conversation!.id, admin.staff.id))).toBeUndefined();
  });

  it("proposes sign-ins and records them only after the person confirms", async () => {
    const admin = await session();
    const laptop = await device(admin.staff.id, { name: "Office laptop" });
    const work = await browserProfile(laptop.id, admin.staff.id, { name: "Work" });
    replies.push(
      callTool("record_sign_ins", { deviceId: laptop.id, browserProfileId: work.id, accounts: [{ provider: "Google", identifier: "new@example.com" }, { provider: "github", identifier: "octo" }] }),
      say("I propose recording two sign-ins."),
    );
    const received = await drain(await prepareQuestion(admin, { conversationId: null, text: "I signed in to Google new@example.com and GitHub octo in Chrome Work on the office laptop" }));
    expect(received.at(-1)).toMatchObject({ type: "done", state: "awaiting_confirmation" });
    expect(await db.select().from(signIns)).toHaveLength(0);

    const [action] = await db.select().from(aiActions);
    expect(action).toMatchObject({ tool: "record_sign_ins", status: "pending" });
    expect(JSON.stringify(action.preview.fields)).toContain("new@example.com");
    expect(action.preview.note).toBeTruthy();

    replies.push(say("Both are recorded."));
    const confirmed = await drain(await prepareConfirmation(admin, action.id, {}));
    expect(confirmed.at(-1)).toMatchObject({ type: "done", state: "complete" });
    expect(await db.select().from(signIns)).toHaveLength(2);
    expect((await db.select().from(accounts)).map((account) => account.identifier).sort()).toEqual(["new@example.com", "octo"]);
    // The model got the outcome of the change.
    expect(JSON.stringify(toolResults(requests.at(-1)!))).toContain("octo");

    await expect(prepareConfirmation(admin, action.id, {})).rejects.toMatchObject({ status: 409, messageKey: "errors.aiActionDecided" });
  });

  it("skips accounts that are already signed in at that place", async () => {
    const admin = await session();
    const laptop = await device(admin.staff.id);
    await signIn(admin.staff.id, { deviceId: laptop.id, app: "Windows" }, { provider: "microsoft", identifier: "me@outlook.com" });
    replies.push(callTool("record_sign_ins", { deviceId: laptop.id, app: "windows", accounts: [{ provider: "Microsoft", identifier: "ME@outlook.com" }] }), say("Proposed."));
    await drain(await prepareQuestion(admin, { conversationId: null, text: "I am signed in to Windows with me@outlook.com" }));
    const [action] = await db.select().from(aiActions);

    replies.push(say("It was already there."));
    await drain(await prepareConfirmation(admin, action.id, {}));
    const [done] = await db.select().from(aiActions);
    expect(done.result).toMatchObject({ ok: true, data: { recorded: [], alreadySignedIn: ["me@outlook.com"] } });
    expect(await db.select().from(signIns)).toHaveLength(1);
  });

  it("marks a sign-out only after the person confirms", async () => {
    const admin = await session();
    const laptop = await device(admin.staff.id);
    const row = await signIn(admin.staff.id, { deviceId: laptop.id }, { provider: "google", identifier: "a@example.com" });
    replies.push(callTool("sign_out", { signInIds: [row.id] }), say("Proposed."));
    await drain(await prepareQuestion(admin, { conversationId: null, text: "I signed out of a@example.com on the laptop" }));
    expect((await db.select().from(signIns).where(eq(signIns.id, row.id)))[0].status).toBe("signed_in");

    const [action] = await db.select().from(aiActions);
    replies.push(say("Done."));
    await drain(await prepareConfirmation(admin, action.id, {}));
    expect((await db.select().from(signIns).where(eq(signIns.id, row.id)))[0].status).toBe("signed_out");
  });

  it("reports an unknown provider to the model instead of proposing a change", async () => {
    const admin = await session();
    const laptop = await device(admin.staff.id);
    replies.push(callTool("record_sign_ins", { deviceId: laptop.id, accounts: [{ provider: "Bitbucket", identifier: "me" }] }), say("Bitbucket is not a provider yet."));
    await drain(await prepareQuestion(admin, { conversationId: null, text: "I signed in to Bitbucket on the laptop" }));
    const results = JSON.stringify(toolResults(requests[1]));
    expect(results).toContain("is_error");
    expect(results).toContain("Bitbucket");
    expect(await db.select().from(aiActions)).toHaveLength(0);
  });

  it("replays Claude's thinking inside the running tool loop only", async () => {
    const admin = await session();
    const thinking = (signature: string) => ({ type: "thinking", thinking: "", signature });
    const toolUse = { type: "tool_use", id: "toolu_a1", name: "list_devices", input: {} };
    replies.push(
      json({ content: [thinking("sig-a"), toolUse], usage, stop_reason: "tool_use" }),
      json({ content: [thinking("sig-b"), { type: "text", text: "No devices yet." }], usage, stop_reason: "end_turn" }),
    );
    const first = await drain(await prepareQuestion(admin, { conversationId: null, text: "Which devices do I have?" }));
    const conversationId = first[0].type === "conversation" ? first[0].conversation.id : 0;
    expect(requests[0]).toMatchObject({ max_tokens: 16_000, output_config: { effort: "medium" } });
    // Inside the loop the thinking block goes back unchanged, with the provider's own call id.
    expect((requests[1].messages as unknown[])[1]).toEqual({ role: "assistant", content: [thinking("sig-a"), toolUse] });

    replies.push(say("You're welcome."));
    await drain(await prepareQuestion(admin, { conversationId, text: "Thank you" }));
    // A finished turn goes back without its thinking.
    const later = JSON.stringify(requests[2].messages);
    expect(later).not.toContain("sig-a");
    expect(later).not.toContain("sig-b");
    expect(later).toContain("toolu_a1");
  });

  it("reports an empty reply instead of storing it", async () => {
    const admin = await session();
    replies.push(json({ content: [{ type: "thinking", thinking: "", signature: "sig" }], usage, stop_reason: "max_tokens" }));
    const received: AgentStreamEvent[] = [];
    // The route's stream turns this error into an error event; the question stays for "continue".
    await expect((await prepareQuestion(admin, { conversationId: null, text: "Hello" }))((event) => received.push(event))).rejects.toMatchObject({
      messageKey: "errors.aiEmptyReply",
    });
    const conversation = received[0].type === "conversation" ? received[0].conversation : null;
    const detail = await conversationDetail(admin.staff.id, conversation!.id);
    expect(detail.messages.map((message) => message.role)).toEqual(["user"]);
  });

  it("offers only the tools of the person's role", async () => {
    const viewer = await session("viewer");
    const laptop = await device(viewer.staff.id);
    replies.push(callTool("add_browser_profile", { deviceId: laptop.id, name: "Not allowed" }), say("Sorry, I cannot."));
    const received = await drain(await prepareQuestion(viewer, { conversationId: null, text: "Add a profile" }));

    const tools = (requests[0].tools as { name: string }[]).map((tool) => tool.name);
    expect(tools).toEqual(expect.arrayContaining(["find_account", "list_devices", "get_overview"]));
    expect(tools).not.toContain("record_sign_ins");
    expect(tools).not.toContain("add_browser_profile");
    expect(received.at(-1)).toMatchObject({ type: "done", state: "complete" });
    expect(JSON.stringify(toolResults(requests[1]))).toContain("not allowed");
    expect(await db.select().from(aiActions)).toHaveLength(0);
  });

  it("cannot reach another workspace's devices", async () => {
    const admin = await session();
    const other = await createTestTenant(owner, "other");
    const foreign = await inTenant(other, () => device(admin.staff.id, { name: "Secret laptop" }));
    replies.push(callTool("get_device", { deviceId: foreign.id }), say("Not found."));
    await drain(await prepareQuestion(admin, { conversationId: null, text: `What is on device ${foreign.id}?` }));
    const results = JSON.stringify(toolResults(requests[1]));
    expect(results).not.toContain("Secret laptop");
    expect(results).toContain("is_error");
  });

  it("keeps passwords out of the chat", async () => {
    const admin = await session();
    expect(redactSecrets("app password: abcd efgh ijkl mnop ya")).toBe("app password: ••• ya");
    expect(redactSecrets("key sk-ant-api03-abcdefghijklmnop1234")).toBe("key sk-ant-•••");
    expect(redactSecrets("note: plan four more days soon")).toBe("note: plan four more days soon");
    // The word for "password" in every language comes from the language files.
    const words = await secretWords();
    const localWord = words.find((word) => !["password", "pass", "pwd", "passcode"].includes(word.trim().toLowerCase()))!.trim();
    expect(redactSecrets(`${localWord}: abcd efgh ijkl mnop`, words)).toBe(`${localWord}: •••`);

    replies.push(say("AkunMu does not keep passwords; consider changing it."));
    await drain(await prepareQuestion(admin, { conversationId: null, text: `My Gmail is galih@example.com ${localWord}: Sup3rSecret!x` }));
    expect(JSON.stringify(requests)).not.toContain("Sup3rSecret");
  });

  it("declines open proposals when the person asks something else", async () => {
    const admin = await session();
    const laptop = await device(admin.staff.id);
    const row = await signIn(admin.staff.id, { deviceId: laptop.id }, { provider: "google", identifier: "a@example.com" });
    replies.push(callTool("sign_out", { signInIds: [row.id] }), say("Proposed."));
    const first = await drain(await prepareQuestion(admin, { conversationId: null, text: "Sign me out" }));
    const conversationId = first[0].type === "conversation" ? first[0].conversation.id : 0;

    replies.push(say("Okay."));
    await drain(await prepareQuestion(admin, { conversationId, text: "Never mind, just saying hello." }));
    const [action] = await db.select().from(aiActions);
    expect(action.status).toBe("declined");
    await expect(declineAction(admin, action.id)).rejects.toMatchObject({ status: 409 });
    expect((await db.select().from(signIns).where(eq(signIns.id, row.id)))[0].status).toBe("signed_in");
  });
});
