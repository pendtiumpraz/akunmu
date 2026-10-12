import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { localCliProfiles } from "@/modules/connect/local-cli";
import { claudeConfigFolder, isCliTool, profileClientName } from "@/modules/devices/types";

let home: string;

beforeEach(() => {
  home = mkdtempSync(path.join(tmpdir(), "akunmu-cli-"));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

function folder(name: string, files: Record<string, string> = {}) {
  mkdirSync(path.join(home, name));
  for (const [file, content] of Object.entries(files)) writeFileSync(path.join(home, name, file), content);
}

const signedIn = (email: string) => JSON.stringify({ oauthAccount: { emailAddress: email, organizationName: "Team" } });

describe("Claude Code profiles of this computer", () => {
  it("are the default folder and every ~/.claude-<name> config folder, each with the account signed in to it", () => {
    folder(".claude", { "settings.json": "{}" });
    // Without CLAUDE_CONFIG_DIR, the default folder's account sits next to it.
    writeFileSync(path.join(home, ".claude.json"), signedIn("me@example.com"));
    folder(".claude-work", { ".claude.json": signedIn("work@example.com"), "settings.json": "{}" });
    folder(".claude-new", { "settings.json": "{}" });
    folder(".claude-broken", { ".claude.json": "{not json" });
    // Not config folders: nothing Claude Code keeps, another name, a file.
    folder(".claude-notes");
    folder(".clauderc");
    writeFileSync(path.join(home, ".claude-file"), "");

    const profile = (name: string, email: string | null) => ({ client: "claude-code", directory: path.join(home, `.${name}`), name, email });
    expect(localCliProfiles(home)).toEqual([
      profile("claude", "me@example.com"),
      profile("claude-broken", null),
      profile("claude-new", null),
      profile("claude-work", "work@example.com"),
    ]);
  });

  it("are none when the home folder cannot be read", () => {
    expect(localCliProfiles(path.join(home, "missing"))).toEqual([]);
  });
});

describe("profile clients", () => {
  it("tell command-line tools from browsers and name them", () => {
    expect(isCliTool("claude-code")).toBe(true);
    expect(isCliTool("chrome")).toBe(false);
    expect(profileClientName("claude-code")).toBe("Claude Code");
    expect(profileClientName("chrome")).toBe("Chrome");
    expect(profileClientName("other")).toBeNull();
  });

  it("suggest the config folder of a Claude Code command", () => {
    expect(claudeConfigFolder("claude")).toBe("~/.claude");
    expect(claudeConfigFolder(" claude-work ")).toBe("~/.claude-work");
    expect(claudeConfigFolder("codex")).toBeNull();
    expect(claudeConfigFolder("claude work")).toBeNull();
  });
});
