import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { recordSignIn, signOut, treeView, updateSignIn } from "@/modules/signins/service";
import { signInInputSchema, signInUpdateSchema } from "@/modules/signins/validation";
import { openTestDatabase, type TestDatabase } from "../helpers/database";
import { browserProfile, device, signIn, staffUser } from "../helpers/fixtures";

let database: TestDatabase;

beforeEach(async () => {
  database = await openTestDatabase();
});

afterEach(async () => {
  await database.close();
});

const invalid = (messageKey: string) => ({ status: 422, issues: [{ path: "approvedFromId", messageKey }] });

describe("where an account grew from", () => {
  it("records a command-line tool let in with a code from a browser on another device", async () => {
    const admin = await staffUser();
    const laptop = await device(admin.id, { name: "Laptop A" });
    const server = await device(admin.id, { name: "Server B", kind: "desktop", system: "linux" });
    const chrome = await browserProfile(laptop.id, admin.id, { name: "Work" });
    const origin = await signIn(admin.id, { deviceId: laptop.id, profileId: chrome.id }, { provider: "claude", identifier: "galih@example.com" });

    const cli = await recordSignIn(
      signInInputSchema.parse({ accountId: origin.account.id, deviceId: server.id, app: "Claude Code", appKind: "cli", approvedFromId: origin.id, approvalMethod: "code" }),
      admin.id,
    );
    expect(cli).toMatchObject({ app: "Claude Code", appKind: "cli", approvedFromId: origin.id, approvalMethod: "code" });
    expect(origin).toMatchObject({ appKind: null, approvedFromId: null, approvalMethod: null });

    // A method needs an origin, and an app without a kind is an app.
    const app = await recordSignIn(signInInputSchema.parse({ accountId: origin.account.id, deviceId: server.id, app: "Claude", approvalMethod: "qr" }), admin.id);
    expect(app).toMatchObject({ appKind: "app", approvedFromId: null, approvalMethod: null });

    // Moving the sign-in into a browser profile drops the app kind.
    const serverChrome = await browserProfile(server.id, admin.id, { name: "Default" });
    const moved = await updateSignIn(app.id, signInUpdateSchema.parse({ profileId: serverChrome.id, app: null }), admin.id);
    expect(moved).toMatchObject({ app: null, appKind: null });
  });

  it("lets an account grow only from its own sign-ins, and never from itself", async () => {
    const admin = await staffUser();
    const [laptop, phone, tablet] = [await device(admin.id), await device(admin.id, { kind: "phone", system: "android" }), await device(admin.id, { kind: "tablet", system: "ipados" })];
    const first = await signIn(admin.id, { deviceId: laptop.id }, { provider: "google", identifier: "a@example.com" });
    const stranger = await signIn(admin.id, { deviceId: laptop.id }, { provider: "github", identifier: "someone" });

    await expect(recordSignIn(signInInputSchema.parse({ accountId: first.account.id, deviceId: phone.id, approvedFromId: stranger.id }), admin.id)).rejects.toMatchObject(
      invalid("validation.originChoice"),
    );

    const second = await recordSignIn(signInInputSchema.parse({ accountId: first.account.id, deviceId: phone.id, approvedFromId: first.id, approvalMethod: "prompt" }), admin.id);
    const third = await recordSignIn(signInInputSchema.parse({ accountId: first.account.id, deviceId: tablet.id, approvedFromId: second.id, approvalMethod: "qr" }), admin.id);

    // The first sign-in cannot grow from the third: the third grew from the second, which grew from the first.
    await expect(updateSignIn(first.id, signInUpdateSchema.parse({ approvedFromId: third.id }), admin.id)).rejects.toMatchObject(invalid("validation.originLoop"));
    await expect(updateSignIn(second.id, signInUpdateSchema.parse({ approvedFromId: second.id }), admin.id)).rejects.toMatchObject(invalid("validation.originChoice"));

    const method = await updateSignIn(third.id, signInUpdateSchema.parse({ approvalMethod: "link" }), admin.id);
    expect(method).toMatchObject({ approvedFromId: second.id, approvalMethod: "link" });
    const cleared = await updateSignIn(third.id, signInUpdateSchema.parse({ approvedFromId: null }), admin.id);
    expect(cleared).toMatchObject({ approvedFromId: null, approvalMethod: null });
  });

  it("keeps the trail for the trees after the place it grew from is signed out", async () => {
    const admin = await staffUser();
    const [laptop, server] = [await device(admin.id), await device(admin.id, { kind: "desktop", system: "linux" })];
    const origin = await signIn(admin.id, { deviceId: laptop.id }, { provider: "github", identifier: "galihpraz" });
    const cli = await recordSignIn(signInInputSchema.parse({ accountId: origin.account.id, deviceId: server.id, app: "gh", appKind: "cli", approvedFromId: origin.id, approvalMethod: "code" }), admin.id);
    await signOut(origin.id, admin.id);

    const data = await treeView();
    expect(data.signIns.find((row) => row.id === origin.id)).toMatchObject({ status: "signed_out" });
    expect(data.signIns.find((row) => row.id === cli.id)).toMatchObject({ status: "signed_in", approvedFromId: origin.id, approvalMethod: "code" });
  });
});
