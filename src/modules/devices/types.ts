/** Device and browser profile types shared by the server and the browser (no database imports). */

export const DEVICE_KINDS = ["laptop", "desktop", "phone", "tablet", "other"] as const;
export type DeviceKind = (typeof DEVICE_KINDS)[number];

export const DEVICE_SYSTEMS = ["windows", "macos", "linux", "chromeos", "android", "ios", "ipados", "other"] as const;
export type DeviceSystem = (typeof DEVICE_SYSTEMS)[number];

export const BROWSERS = ["chrome", "edge", "firefox", "safari", "brave", "opera", "arc", "vivaldi", "samsung", "other"] as const;
export type Browser = (typeof BROWSERS)[number];

/** Colors a browser profile can be marked with (as browsers do), plus none. */
export const PROFILE_COLORS = ["#2563eb", "#0d9488", "#16a34a", "#ca8a04", "#ea580c", "#dc2626", "#db2777", "#7c3aed", "#475569"] as const;

/** Product names, the same in every language; "other" is translated (`devices.browserOther`, `devices.systemOther`). */
export const BROWSER_NAMES: Record<Exclude<Browser, "other">, string> = {
  chrome: "Chrome",
  edge: "Edge",
  firefox: "Firefox",
  safari: "Safari",
  brave: "Brave",
  opera: "Opera",
  arc: "Arc",
  vivaldi: "Vivaldi",
  samsung: "Samsung Internet",
};

/**
 * Command-line tools that keep each account in a profile of its own: one config folder per profile, run by a command
 * of its own (Claude Code: `claude-work` signs in with ~/.claude-work). Their profiles are stored with the browser
 * profiles, so a device can hold several accounts of one tool, each in its own place.
 */
export const CLI_TOOLS = ["claude-code"] as const;
export type CliTool = (typeof CLI_TOOLS)[number];

/** What a profile belongs to: a browser or a command-line tool (stored in `browser_profiles.browser`). */
export const PROFILE_CLIENTS = [...BROWSERS, ...CLI_TOOLS] as const;
export type ProfileClient = (typeof PROFILE_CLIENTS)[number];

export const CLI_TOOL_NAMES: Record<CliTool, string> = { "claude-code": "Claude Code" };

export function isCliTool(client: string): client is CliTool {
  return (CLI_TOOLS as readonly string[]).includes(client);
}

/** A profile client's product name; null for "other", which the caller translates (`devices.browserOther`). */
export function profileClientName(client: ProfileClient): string | null {
  if (isCliTool(client)) return CLI_TOOL_NAMES[client];
  return client === "other" ? null : BROWSER_NAMES[client];
}

/** The config folder a Claude Code command uses by convention: `claude` → ~/.claude, `claude-work` → ~/.claude-work. */
export function claudeConfigFolder(command: string): string | null {
  const name = command.trim();
  return /^claude(-[A-Za-z0-9._-]+)?$/.test(name) ? `~/.${name}` : null;
}

export const SYSTEM_NAMES: Record<Exclude<DeviceSystem, "other">, string> = {
  windows: "Windows",
  macos: "macOS",
  linux: "Linux",
  chromeos: "ChromeOS",
  android: "Android",
  ios: "iOS",
  ipados: "iPadOS",
};
