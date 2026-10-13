import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createProject,
  deleteProject,
  listProjectsView,
  projectDetail,
  projectScreenshot,
  removeProjectScreenshot,
  setProjectScreenshot,
  updateProject,
} from "@/modules/projects/service";
import { projectInputSchema, projectUpdateSchema } from "@/modules/projects/validation";
import { treeView } from "@/modules/signins/service";
import { inTenant } from "@/shared/db";
import { parseWith } from "@/shared/http/validation";
import { createTestTenant, openTestDatabase, type TestDatabase } from "../helpers/database";
import { browserProfile, device, signIn, staffUser } from "../helpers/fixtures";

let database: TestDatabase;
let uploads: string;

beforeEach(async () => {
  uploads = mkdtempSync(path.join(tmpdir(), "akunmu-uploads-"));
  process.env.AKUNMU_UPLOADS_DIR = uploads;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  database = await openTestDatabase();
});

afterEach(async () => {
  await database.close();
  delete process.env.AKUNMU_UPLOADS_DIR;
  rmSync(uploads, { recursive: true, force: true });
});

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 2)]);

async function cliSession() {
  const admin = await staffUser();
  const laptop = await device(admin.id, { name: "Laptop" });
  const cli = await browserProfile(laptop.id, admin.id, { browser: "claude-code", name: "claude-work", directory: "~/.claude-work" });
  const session = await signIn(admin.id, { deviceId: laptop.id, profileId: cli.id }, { provider: "claude", identifier: "work@example.com" });
  return { admin, laptop, session };
}

describe("projects", () => {
  it("record what a session works on, with its site (scheme added), and hang off that session in the trees", async () => {
    const { admin, session } = await cliSession();
    const project = await createProject(parseWith(projectInputSchema, { name: "Site rebuild", url: "example.com/app", signInIds: [session.id] }), admin.id);
    expect(project).toMatchObject({ name: "Site rebuild", url: "https://example.com/app", screenshot: null, signInIds: [session.id] });
    expect((await listProjectsView()).map((item) => item.name)).toEqual(["Site rebuild"]);

    const row = (await treeView()).signIns.find((item) => item.id === session.id);
    expect(row?.projects).toEqual([{ id: project.id, name: "Site rebuild", url: "https://example.com/app", screenshot: null }]);

    // Links are replaced only when sent.
    expect((await updateProject(project.id, parseWith(projectUpdateSchema, { notes: "Landing first" }), admin.id)).signInIds).toEqual([session.id]);
    expect((await updateProject(project.id, parseWith(projectUpdateSchema, { signInIds: [] }), admin.id)).signInIds).toEqual([]);
    await expect(updateProject(project.id, parseWith(projectUpdateSchema, { signInIds: [99_999] }), admin.id)).rejects.toMatchObject({ status: 422 });
  });

  it("keep one screenshot each, checked by its signature, and remove the file with it", async () => {
    const { admin, session } = await cliSession();
    const project = await createProject(parseWith(projectInputSchema, { name: "Video series", signInIds: [session.id] }), admin.id);
    const stored = () => (existsSync(uploads) ? readdirSync(uploads, { recursive: true }).map(String).filter((entry) => /\.(png|jpg)$/.test(entry)) : []);

    await expect(setProjectScreenshot(project.id, Buffer.from("<svg onload=alert(1)>"), admin.id)).rejects.toMatchObject({ status: 422 });
    const first = await setProjectScreenshot(project.id, PNG, admin.id);
    expect(first.screenshot).toMatch(new RegExp(`^/api/projects/${project.id}/screenshot\\?v=\\d+$`));
    const served = await projectScreenshot(project.id);
    expect(served && "data" in served ? [served.type, served.data.length] : null).toEqual(["image/png", PNG.length]);
    expect(stored()).toHaveLength(1);

    // A new one replaces the file; removing it leaves none.
    const second = await setProjectScreenshot(project.id, JPEG, admin.id);
    const again = await projectScreenshot(project.id);
    expect(again && "type" in again ? again.type : null).toBe("image/jpeg");
    expect(second.screenshot).not.toBe(first.screenshot);
    expect(stored()).toEqual([expect.stringMatching(/\.jpg$/)]);
    expect((await removeProjectScreenshot(project.id, admin.id)).screenshot).toBeNull();
    expect(await projectScreenshot(project.id)).toBeNull();
    expect(stored()).toEqual([]);

    // Deleting the project takes its screenshot and its links along.
    await setProjectScreenshot(project.id, PNG, admin.id);
    await deleteProject(project.id, admin.id);
    await expect(projectDetail(project.id)).rejects.toMatchObject({ status: 404 });
    expect((await treeView()).signIns.find((item) => item.id === session.id)?.projects).toEqual([]);
    expect(stored()).toEqual([]);
  });

  it("stay inside their workspace", async () => {
    const { admin, session } = await cliSession();
    const project = await createProject(parseWith(projectInputSchema, { name: "Private work", signInIds: [session.id] }), admin.id);
    const other = await createTestTenant(database.owner, "workspace-b");
    await inTenant(other, async () => {
      expect(await listProjectsView()).toEqual([]);
      await expect(projectDetail(project.id)).rejects.toMatchObject({ status: 404 });
      const outsider = await staffUser();
      // A session of another workspace cannot be linked.
      await expect(createProject(parseWith(projectInputSchema, { name: "Theirs", signInIds: [session.id] }), outsider.id)).rejects.toMatchObject({ status: 422 });
    });
  });
});
