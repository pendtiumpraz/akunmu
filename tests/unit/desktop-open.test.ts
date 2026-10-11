import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * /desktop/open: an akunmu:// link handed over by the desktop shell. Only with this launch's key, only http(s)
 * addresses, and only on the computer the link names; then the profile opens (the browser start is mocked).
 */

const { opened } = vi.hoisted(() => ({ opened: [] as unknown[][] }));

vi.mock("@/modules/connect/local-browsers", () => ({
  thisComputer: () => ({ hostname: "test-pc", system: "windows" }),
  localProfiles: () => [],
  findLocalProfile: () => undefined,
  openLocalProfile: (...args: unknown[]) => {
    opened.push(args);
    return true;
  },
}));

const { GET } = await import("@/app/desktop/open/route");

const KEY = "launch-key-0123456789";
const call = (query: string) => GET(new Request(`http://127.0.0.1:4000/desktop/open?${query}`));

beforeEach(() => {
  process.env.AKUNMU_DESKTOP = "1";
  process.env.AKUNMU_DESKTOP_TOKEN = KEY;
  opened.length = 0;
});

afterEach(() => {
  delete process.env.AKUNMU_DESKTOP;
  delete process.env.AKUNMU_DESKTOP_TOKEN;
});

describe("opening a profile from an akunmu:// link", () => {
  it("does not exist without this launch's key", async () => {
    expect((await call("browser=chrome&profile=Work")).status).toBe(404);
    expect((await call("key=wrong-key-0123456789&browser=chrome&profile=Work")).status).toBe(404);
    delete process.env.AKUNMU_DESKTOP;
    expect((await call(`key=${KEY}&browser=chrome&profile=Work`)).status).toBe(404);
    expect(opened).toEqual([]);
  });

  it("refuses an unknown browser or an address that is not http(s)", async () => {
    expect((await call(`key=${KEY}&browser=netscape&profile=Work`)).status).toBe(400);
    expect((await call(`key=${KEY}&browser=chrome&profile=Work&url=${encodeURIComponent("file:///C:/Windows")}`)).status).toBe(400);
    expect(opened).toEqual([]);
  });

  it("opens only on the computer the link names", async () => {
    expect((await call(`key=${KEY}&browser=chrome&profile=Work&host=other-pc`)).status).toBe(409);
    expect(opened).toEqual([]);

    const response = await call(`key=${KEY}&browser=chrome&profile=Work&directory=Profile%201&host=TEST-PC&url=${encodeURIComponent("https://github.com")}`);
    expect(response.status).toBe(200);
    expect(opened).toEqual([[{ browser: "chrome", name: "Work", directory: "Profile 1", email: null, host: "TEST-PC" }, "https://github.com"]]);
  });
});
