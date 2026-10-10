/** Device and browser profile types shared by the server and the browser (no database imports). */

export const DEVICE_KINDS = ["laptop", "desktop", "phone", "tablet", "other"] as const;
export type DeviceKind = (typeof DEVICE_KINDS)[number];

export const DEVICE_SYSTEMS = ["windows", "macos", "linux", "chromeos", "android", "ios", "ipados", "other"] as const;
export type DeviceSystem = (typeof DEVICE_SYSTEMS)[number];

export const BROWSERS = ["chrome", "edge", "firefox", "safari", "brave", "opera", "arc", "other"] as const;
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
};

export const SYSTEM_NAMES: Record<Exclude<DeviceSystem, "other">, string> = {
  windows: "Windows",
  macos: "macOS",
  linux: "Linux",
  chromeos: "ChromeOS",
  android: "Android",
  ios: "iOS",
  ipados: "iPadOS",
};
