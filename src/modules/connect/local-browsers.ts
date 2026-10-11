import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir, hostname, platform } from "node:os";
import path from "node:path";
import type { Browser, DeviceSystem } from "../devices/types";

/**
 * The browser profiles of the computer the desktop app runs on, read from each Chromium browser's "Local State" file
 * (profile folders, names and their Google accounts), and opening a site in one of them. Desktop app only: on a server
 * this would describe the server.
 */

type LocalBrowser = { browser: Browser; userData: string; executables: string[] };
export type LocalProfile = { browser: Browser; directory: string; name: string; email: string | null };

function localBrowsers(): LocalBrowser[] {
  const os = platform();
  if (os === "win32") {
    const local = process.env.LOCALAPPDATA ?? path.join(homedir(), "AppData", "Local");
    const bases = [process.env.ProgramFiles, process.env["ProgramFiles(x86)"], local].filter((base): base is string => Boolean(base));
    const inBases = (...parts: string[]) => bases.map((base) => path.join(base, ...parts));
    return [
      { browser: "chrome", userData: path.join(local, "Google", "Chrome", "User Data"), executables: inBases("Google", "Chrome", "Application", "chrome.exe") },
      { browser: "edge", userData: path.join(local, "Microsoft", "Edge", "User Data"), executables: inBases("Microsoft", "Edge", "Application", "msedge.exe") },
      { browser: "brave", userData: path.join(local, "BraveSoftware", "Brave-Browser", "User Data"), executables: inBases("BraveSoftware", "Brave-Browser", "Application", "brave.exe") },
      { browser: "vivaldi", userData: path.join(local, "Vivaldi", "User Data"), executables: inBases("Vivaldi", "Application", "vivaldi.exe") },
    ];
  }
  if (os === "darwin") {
    const support = path.join(homedir(), "Library", "Application Support");
    const app = (bundle: string, binary: string) => [path.join("/Applications", bundle, "Contents", "MacOS", binary)];
    return [
      { browser: "chrome", userData: path.join(support, "Google", "Chrome"), executables: app("Google Chrome.app", "Google Chrome") },
      { browser: "edge", userData: path.join(support, "Microsoft Edge"), executables: app("Microsoft Edge.app", "Microsoft Edge") },
      { browser: "brave", userData: path.join(support, "BraveSoftware", "Brave-Browser"), executables: app("Brave Browser.app", "Brave Browser") },
      { browser: "vivaldi", userData: path.join(support, "Vivaldi"), executables: app("Vivaldi.app", "Vivaldi") },
    ];
  }
  const config = process.env.XDG_CONFIG_HOME ?? path.join(homedir(), ".config");
  const onPath = (...names: string[]) => names.flatMap((name) => ["/usr/bin", "/usr/local/bin", "/snap/bin", "/opt/google/chrome"].map((dir) => path.join(dir, name)));
  return [
    { browser: "chrome", userData: path.join(config, "google-chrome"), executables: onPath("google-chrome", "google-chrome-stable") },
    { browser: "edge", userData: path.join(config, "microsoft-edge"), executables: onPath("microsoft-edge", "microsoft-edge-stable") },
    { browser: "brave", userData: path.join(config, "BraveSoftware", "Brave-Browser"), executables: onPath("brave-browser", "brave") },
    { browser: "vivaldi", userData: path.join(config, "vivaldi"), executables: onPath("vivaldi", "vivaldi-stable") },
  ];
}

type LocalState = { profile?: { info_cache?: Record<string, { name?: string; user_name?: string }> } };

/** Every profile of every installed Chromium browser on this computer. */
export function localProfiles(): LocalProfile[] {
  return localBrowsers().flatMap(({ browser, userData }) => {
    const file = path.join(userData, "Local State");
    if (!existsSync(file)) return [];
    try {
      const cache = (JSON.parse(readFileSync(file, "utf8")) as LocalState).profile?.info_cache ?? {};
      return Object.entries(cache).map(([directory, info]) => ({ browser, directory, name: info.name?.trim() || directory, email: info.user_name?.trim() || null }));
    } catch {
      return [];
    }
  });
}

/** This computer as AkunMu records it: its host name (lowercase) and system. */
export function thisComputer(): { hostname: string; system: DeviceSystem } {
  const os = platform();
  const system: DeviceSystem = os === "win32" ? "windows" : os === "darwin" ? "macos" : os === "linux" ? "linux" : "other";
  return { hostname: hostname().trim().toLowerCase(), system };
}

export type ProfileTarget = { browser: Browser; directory?: string | null; name?: string | null; email?: string | null };

/** The local profile a recorded one is: by folder, else by name, else by Google account. */
export function findLocalProfile(target: ProfileTarget, profiles: LocalProfile[] = localProfiles()): LocalProfile | undefined {
  const same = (a: string | null | undefined, b: string | null | undefined) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());
  const candidates = profiles.filter((profile) => profile.browser === target.browser);
  return (
    candidates.find((profile) => same(profile.directory, target.directory)) ??
    candidates.find((profile) => same(profile.name, target.name)) ??
    candidates.find((profile) => same(profile.email, target.email))
  );
}

/** Opens a site (or the browser's start page) in one of this computer's profiles; false when that is not possible. */
export function openLocalProfile(target: ProfileTarget, url: string | null): boolean {
  const browser = localBrowsers().find((candidate) => candidate.browser === target.browser);
  const profile = findLocalProfile(target);
  const executable = browser?.executables.find((file) => existsSync(file));
  if (!profile || !executable) return false;
  // Plain arguments, no shell: the folder comes from the browser's own file, the address is checked to be http(s).
  const child = spawn(executable, [`--profile-directory=${profile.directory}`, ...(url ? [url] : [])], { detached: true, stdio: "ignore" });
  child.on("error", () => undefined);
  child.unref();
  return true;
}
