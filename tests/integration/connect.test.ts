import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findIngestTokenById } from "@/modules/connect/repository";
import {
  acceptAllFindings,
  acceptFinding,
  applyReport,
  authenticateIngest,
  createIngestToken,
  dismissFinding,
  ingestHello,
  listFindingsView,
  revokeIngestToken,
  scanThisComputer,
  thisComputerView,
} from "@/modules/connect/service";
import { ingestReportSchema, openProfileSchema } from "@/modules/connect/validation";
import { findDeviceByHostname, findDeviceById, listProfiles } from "@/modules/devices/repository";
import { updateDevice } from "@/modules/devices/service";
import { signInRows } from "@/modules/signins/repository";
import { openTestDatabase, type TestDatabase } from "../helpers/database";
import { browserProfile, device, signIn, staffUser } from "../helpers/fixtures";

const { LOCAL } = vi.hoisted(() => ({
  LOCAL: [
    { browser: "chrome", directory: "Profile 1", name: "Work", email: "galih@example.com" },
    { browser: "edge", directory: "Default", name: "Person 1", email: null },
  ],
}));

vi.mock("@/modules/connect/local-browsers", () => ({
  thisComputer: () => ({ hostname: "test-pc", system: "windows" }),
  localProfiles: () => LOCAL,
  openLocalProfile: () => true,
  findLocalProfile: (target: { browser: string; directory?: string | null; name?: string | null; email?: string | null }) =>
    LOCAL.find(
      (profile) =>
        profile.browser === target.browser &&
        (profile.directory === target.directory || profile.name === target.name || (Boolean(target.email) && profile.email === target.email)),
    ),
}));

let database: TestDatabase;

beforeEach(async () => {
  database = await openTestDatabase();
});

afterEach(async () => {
  await database.close();
});

const report = (overrides: Record<string, unknown> = {}) =>
  ingestReportSchema.parse({
    agent: { kind: "extension", version: "0.1.0" },
    browser: "chrome",
    profile: { name: "Work", email: "galih@example.com" },
    sessions: [
      { domain: "github.com", identifier: "galihpraz-dev" },
      { domain: "claude.ai", identifier: null },
      { domain: "app.jira.example.com", identifier: "galih" },
    ],
    checked: ["google.com", "github.com", "claude.ai", "slack.com"],
    ...overrides,
  });

describe("extension keys", () => {
  it("are shown once, stored as a hash, and refused once revoked", async () => {
    const admin = await staffUser();
    const laptop = await device(admin.id, { name: "PC #1" });
    const made = await createIngestToken({ deviceId: laptop.id, name: "Chrome di PC #1" }, admin.id);
    expect(made.token).toMatch(/^akm_[A-Za-z0-9_-]{32}$/);
    expect(made.hint).toBe(made.token.slice(-4));
    const stored = await findIngestTokenById(made.id);
    expect(stored?.tokenHash).not.toContain(made.token);

    expect((await authenticateIngest(`Bearer ${made.token}`)).id).toBe(made.id);
    await expect(authenticateIngest(`Bearer akm_${"x".repeat(32)}`)).rejects.toMatchObject({ status: 401 });
    await expect(authenticateIngest(null)).rejects.toMatchObject({ status: 401 });
    await revokeIngestToken(made.id, admin.id);
    await expect(authenticateIngest(`Bearer ${made.token}`)).rejects.toMatchObject({ status: 401 });
  });
});

describe("extension reports", () => {
  it("turn what the map lacks into findings, confirm what it has, and mark what disappeared for a check", async () => {
    const admin = await staffUser();
    const laptop = await device(admin.id, { name: "PC #1" });
    const { token } = await createIngestToken({ deviceId: laptop.id, name: "Chrome" }, admin.id);
    const record = await authenticateIngest(`Bearer ${token}`);

    const first = await applyReport(record, report());
    // The profile, its Google account, GitHub, Claude (no account) and an unknown site.
    expect(first).toEqual({ confirmed: 0, findings: 5, review: 0 });
    const found = await listFindingsView();
    expect(found.map((finding) => [finding.kind, finding.payload.provider?.domain ?? null, finding.payload.identifier ?? null]).sort()).toEqual(
      [
        ["profile", null, null],
        ["sign_in", "app.jira.example.com", "galih"],
        ["sign_in", "claude.ai", null],
        ["sign_in", "github.com", "galihpraz-dev"],
        ["sign_in", "google.com", "galih@example.com"],
      ].sort(),
    );

    // Everything with an account is accepted; Claude waits for one, then gets it.
    expect(await acceptAllFindings(admin.id)).toEqual({ accepted: 4, waiting: 1 });
    const claude = (await listFindingsView()).find((finding) => finding.payload.provider?.domain === "claude.ai");
    await expect(acceptFinding(claude!.id, {}, admin.id)).rejects.toMatchObject({ status: 422 });
    await acceptFinding(claude!.id, { identifier: "galih@example.com" }, admin.id);
    expect(await listFindingsView()).toEqual([]);

    const [work] = await listProfiles({ deviceId: laptop.id });
    expect(work).toMatchObject({ name: "Work", browser: "chrome" });
    const rows = await signInRows({ deviceId: laptop.id, profileId: work.id });
    // The unknown site became a provider named after its domain.
    expect(rows.map((row) => `${row.provider.slug}:${row.account.identifier}`).sort()).toEqual([
      "claude:galih@example.com",
      "example:galih",
      "github:galihpraz-dev",
      "google:galih@example.com",
    ]);

    // Seen again: confirmed, nothing new. GitHub is gone from a checked site: marked for a check.
    const again = await applyReport(record, report({ sessions: [{ domain: "claude.ai" }, { domain: "app.jira.example.com", identifier: "galih" }] }));
    expect(again).toMatchObject({ findings: 0, review: 1 });
    expect((await signInRows({ deviceId: laptop.id, profileId: work.id })).find((row) => row.provider.slug === "github")?.review).toBe(true);
  });

  it("keeps a dismissed finding dismissed when it is seen again", async () => {
    const admin = await staffUser();
    const laptop = await device(admin.id);
    const place = await browserProfile(laptop.id, admin.id, { name: "Work" });
    await signIn(admin.id, { deviceId: laptop.id, profileId: place.id }, { provider: "google", identifier: "galih@example.com" });
    const { token } = await createIngestToken({ deviceId: laptop.id, name: "Chrome" }, admin.id);
    const record = await authenticateIngest(`Bearer ${token}`);
    const only = { sessions: [{ domain: "netflix.com", identifier: "family@example.com" }], checked: [] };
    expect(await applyReport(record, report(only))).toEqual({ confirmed: 1, findings: 1, review: 0 });
    const [netflix] = await listFindingsView();
    await dismissFinding(netflix.id, admin.id);
    await applyReport(record, report(only));
    expect(await listFindingsView()).toEqual([]);
  });
});

describe("desktop scan", () => {
  it("finds this computer and its browser profiles, and records them once accepted", async () => {
    const admin = await staffUser();
    expect(await scanThisComputer()).toEqual({ confirmed: 0, findings: 4, review: 0, profiles: 2 });
    expect((await listFindingsView()).map((finding) => finding.kind).sort()).toEqual(["device", "profile", "profile", "sign_in"]);
    expect(await acceptAllFindings(admin.id)).toEqual({ accepted: 4, waiting: 0 });

    const computer = await findDeviceByHostname("test-pc");
    expect(computer).toMatchObject({ name: "test-pc", system: "windows" });
    const profiles = await listProfiles({ deviceId: computer!.id });
    expect(profiles.map((profile) => [profile.browser, profile.name, profile.directory]).sort()).toEqual([
      ["chrome", "Work", "Profile 1"],
      ["edge", "Person 1", "Default"],
    ]);
    // Scanning again finds nothing new and confirms the Google account of the Chrome profile.
    expect(await scanThisComputer()).toEqual({ confirmed: 1, findings: 0, review: 0, profiles: 2 });
    expect((await thisComputerView()).profiles.map((profile) => profile.recorded)).toEqual([true, true]);

    // What "Open in profile" needs comes with the sign-in.
    const [google] = await signInRows({ deviceId: computer!.id });
    expect(google).toMatchObject({ provider: { domain: "google.com" }, device: { hostname: "test-pc" }, profile: { directory: "Profile 1" } });
  });
});

describe("computer names", () => {
  it("belong to one device; a report that names the computer moves the name to the key's device", async () => {
    const admin = await staffUser();
    const office = await device(admin.id, { name: "Office PC", hostname: "DESKTOP-ABC1" });
    expect(office.hostname).toBe("desktop-abc1");
    await expect(device(admin.id, { hostname: "desktop-abc1" })).rejects.toMatchObject({ status: 422 });
    await expect(device(admin.id, { hostname: "not a name" })).rejects.toThrow();

    const laptop = await device(admin.id, { name: "Laptop" });
    const { token } = await createIngestToken({ deviceId: laptop.id, name: "Chrome" }, admin.id);
    await applyReport(await authenticateIngest(`Bearer ${token}`), report({ hostname: "DESKTOP-ABC1", sessions: [], checked: [] }));
    expect((await findDeviceByHostname("desktop-abc1"))?.id).toBe(laptop.id);
    expect((await findDeviceById(office.id))?.hostname).toBeNull();

    // Cleared from the form with an empty value.
    await updateDevice(laptop.id, { hostname: null }, admin.id);
    expect(await findDeviceByHostname("desktop-abc1")).toBeUndefined();
  });

  it("are needed to open a profile: a recorded one, or one of this computer's by its folder", () => {
    expect(openProfileSchema.safeParse({ profileId: 3, url: "https://github.com" }).success).toBe(true);
    expect(openProfileSchema.safeParse({ browser: "chrome", directory: "Profile 1" }).success).toBe(true);
    expect(openProfileSchema.safeParse({ browser: "chrome" }).success).toBe(false);
    expect(openProfileSchema.safeParse({ profileId: 3, url: "javascript:alert(1)" }).success).toBe(false);
  });
});

describe("the desktop app", () => {
  beforeEach(() => {
    process.env.AKUNMU_DESKTOP = "1";
  });
  afterEach(() => {
    delete process.env.AKUNMU_DESKTOP;
  });

  it("tells the extension the computer's name and takes this computer's own profile for its reports", async () => {
    const admin = await staffUser();
    const pc = await device(admin.id, { name: "PC" });
    const { token } = await createIngestToken({ deviceId: pc.id, name: "Chrome" }, admin.id);
    const record = await authenticateIngest(`Bearer ${token}`);
    expect((await ingestHello(record)).computer).toBe("test-pc");

    // Reported as "galih" with the Google account of the local "Work" profile: it is that profile, with its folder.
    await applyReport(record, report({ hostname: "test-pc", profile: { name: "galih", email: "galih@example.com" }, sessions: [], checked: [] }));
    const found = (await listFindingsView()).find((finding) => finding.kind === "profile");
    expect(found?.payload.profile).toMatchObject({ name: "Work", directory: "Profile 1" });
    expect((await findDeviceById(pc.id))?.hostname).toBe("test-pc");
  });
});
