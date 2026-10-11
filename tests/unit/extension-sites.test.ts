import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The browser extension's sign-in detection (extension/lib/sites.js), run against a fake cookie jar: built-in rules,
 * the account names some sites state, unknown sites by their cookie names, and discovery of other sites.
 */

type Cookie = { domain: string; path: string; name: string; value: string };
type Sites = {
  siteOf(host: string): string | null;
  sweep(sites: { domain: string }[], options?: { discover?: boolean }): Promise<{ sessions: { domain: string; identifier: string | null }[]; checked: string[] }>;
};

// Plain JavaScript without types, loaded by path (the extension has no build step).
const SITES = new URL("../../extension/lib/sites.js", import.meta.url).href;

const jar: Cookie[] = [
  { domain: ".google.com", path: "/", name: "SID", value: "x" },
  { domain: ".github.com", path: "/", name: "logged_in", value: "yes" },
  { domain: ".github.com", path: "/", name: "dotcom_user", value: "galihpraz-dev" },
  { domain: "claude.ai", path: "/", name: "sessionKey", value: "x" },
  { domain: ".x.com", path: "/", name: "guest_id", value: "x" },
  { domain: "app.jira.example.com", path: "/", name: "remember_web_59ba36", value: "x" },
  { domain: ".shop.example.co.id", path: "/", name: "laravel_session", value: "x" },
  { domain: ".forum.example.org", path: "/", name: "auth_token", value: "x" },
  { domain: ".news.example.net", path: "/", name: "logged_in", value: "0" },
];

function matches(cookie: Cookie, query: { domain?: string; url?: string }): boolean {
  const host = cookie.domain.replace(/^\./, "");
  if (query.domain) return host === query.domain || host.endsWith(`.${query.domain}`);
  if (query.url) {
    const target = new URL(query.url).hostname;
    return target === host || (cookie.domain.startsWith(".") && target.endsWith(`.${host}`));
  }
  return true;
}

let sites: Sites;

beforeEach(async () => {
  vi.stubGlobal("chrome", { cookies: { getAll: async (query: { domain?: string; url?: string }) => jar.filter((cookie) => matches(cookie, query)) } });
  // Google's account list: one account signed in, one signed out ([14] = 1).
  const signedOut = Array(15).fill(null);
  signedOut[3] = "old@example.com";
  signedOut[14] = 1;
  const signedIn = Array(15).fill(null);
  signedIn[3] = "Galih@Example.com";
  signedIn[5] = 1;
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify(["gaia.l.a.r", [signedIn, signedOut]])));
  sites = (await import(/* @vite-ignore */ SITES)) as Sites;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("extension sign-in detection", () => {
  it("names a site by its own domain", () => {
    expect(sites.siteOf("mail.google.com")).toBe("google.com");
    expect(sites.siteOf(".seller.shopee.co.id")).toBe("shopee.co.id");
    expect(sites.siteOf("127.0.0.1")).toBeNull();
    expect(sites.siteOf("localhost")).toBeNull();
  });

  it("finds the workspace's sites signed in, with the account names they state", async () => {
    const result = await sites.sweep([{ domain: "google.com" }, { domain: "github.com" }, { domain: "claude.ai" }, { domain: "x.com" }, { domain: "app.jira.example.com" }]);
    expect(result.sessions).toEqual([
      { domain: "google.com", identifier: "galih@example.com" },
      { domain: "github.com", identifier: "galihpraz-dev" },
      { domain: "claude.ai", identifier: null },
      // Unknown site: a cookie name that means "signed in".
      { domain: "app.jira.example.com", identifier: null },
    ]);
    // Sites with a rule were looked at for sure (x.com: not signed in); the unknown one was not.
    expect(result.checked).toEqual(["google.com", "github.com", "claude.ai", "x.com"]);
  });

  it("discovers other signed-in sites only when asked", async () => {
    expect((await sites.sweep([{ domain: "github.com" }])).sessions).toHaveLength(1);
    const discovered = await sites.sweep([{ domain: "github.com" }], { discover: true });
    // A plain session cookie or a "logged_in=0" is not a sign-in.
    expect(discovered.sessions.map((session) => session.domain)).toEqual(["github.com", "example.com", "example.org"]);
  });
});
