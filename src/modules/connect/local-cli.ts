import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { CliTool } from "../devices/types";

/**
 * The Claude Code profiles of the computer the desktop app runs on: the default config folder (~/.claude, whose account
 * sits in ~/.claude.json) and every ~/.claude-<name> folder (account in its own .claude.json), each run by the command
 * of the same name (`claude-work` → ~/.claude-work, through CLAUDE_CONFIG_DIR). Only the account's email is read;
 * the login itself (.credentials.json) is never opened. Desktop app only: on a server this would describe the server.
 */

export type LocalCliProfile = { client: CliTool; directory: string; name: string; email: string | null };

const FOLDER = /^\.claude(-[A-Za-z0-9._-]+)?$/;
/** Files Claude Code keeps in a config folder; one of them tells it apart from an unrelated ".claude-…" folder. */
const MARKERS = [".claude.json", "settings.json", "history.jsonl", "projects"];

function isFolder(location: string): boolean {
  try {
    return statSync(location).isDirectory();
  } catch {
    return false;
  }
}

/** The signed-in account's email from Claude Code's state file, or null (not signed in, or unreadable). */
function accountEmail(stateFile: string): string | null {
  try {
    const state = JSON.parse(readFileSync(stateFile, "utf8")) as { oauthAccount?: { emailAddress?: unknown } };
    const email = state.oauthAccount?.emailAddress;
    return typeof email === "string" && email.trim() ? email.trim() : null;
  } catch {
    return null;
  }
}

export function localCliProfiles(home: string = homedir()): LocalCliProfile[] {
  let entries: string[];
  try {
    entries = readdirSync(home);
  } catch {
    return [];
  }
  return entries
    .filter((entry) => FOLDER.test(entry))
    .map((entry) => ({ entry, folder: path.join(home, entry) }))
    .filter(({ folder }) => isFolder(folder) && MARKERS.some((marker) => existsSync(path.join(folder, marker))))
    .map(({ entry, folder }) => ({
      client: "claude-code" as const,
      directory: folder,
      name: entry.slice(1),
      // Without CLAUDE_CONFIG_DIR, Claude Code keeps its state next to the folder, in the home folder.
      email: accountEmail(entry === ".claude" ? path.join(home, ".claude.json") : path.join(folder, ".claude.json")),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
