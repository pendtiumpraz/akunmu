import { sweep } from "./sites.js";

/**
 * The extension's connections (an AkunMu workspace on the web, or AkunMu Desktop on this computer) and its reports:
 * for each connection, the sites of that workspace are looked at in this browser profile and the result is sent with
 * the connection's key. State lives in chrome.storage.local, read by the side panel.
 */

const VERSION = chrome.runtime.getManifest().version;
const REQUEST_TIMEOUT_MS = 15_000;
const KEY_PATTERN = /^akm_[A-Za-z0-9_-]{16,}$/;
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);
const BROWSERS = new Set(["chrome", "edge", "brave", "opera", "vivaldi", "arc"]);

/** A failure the panel can explain: address, key, network, unauthorized, busy, server or invalid. */
export class AgentError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const DEFAULT_STATE = { connections: [], profile: null, computer: null, discover: false };

export async function loadState() {
  return { ...DEFAULT_STATE, ...(await chrome.storage.local.get(Object.keys(DEFAULT_STATE))) };
}

async function saveState(changes) {
  await chrome.storage.local.set(changes);
}

/** "akunmu.example.com" → "https://akunmu.example.com"; plain http only for this computer (AkunMu Desktop). */
export function normalizeAddress(input) {
  let text = String(input ?? "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(text)) text = `${/^(127\.0\.0\.1|localhost)(:|$)/i.test(text) ? "http" : "https"}://${text}`;
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new AgentError("address");
  }
  if (url.protocol === "http:" && !LOCAL_HOSTS.has(url.hostname)) throw new AgentError("address");
  return url.origin;
}

async function call(connection, path, body) {
  let response;
  try {
    response = await fetch(`${connection.address}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { Accept: "application/json", Authorization: `Bearer ${connection.key}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      // The key is the only credential: the workspace's own session cookies are never sent.
      credentials: "omit",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new AgentError("network");
  }
  const payload = await response.json().catch(() => null);
  if (response.status === 401) throw new AgentError("unauthorized");
  if (response.status === 429) throw new AgentError("busy");
  if (response.status >= 500) throw new AgentError("server");
  if (!response.ok || !payload) throw new AgentError("invalid");
  return payload.data;
}

/** The browser this extension runs in, as AkunMu names it. */
export function detectBrowser() {
  const brands = (navigator.userAgentData?.brands ?? []).map((entry) => entry.brand.toLowerCase());
  if (brands.some((brand) => brand.includes("edge"))) return "edge";
  if (brands.some((brand) => brand.includes("opera"))) return "opera";
  if (brands.some((brand) => brand.includes("brave")) || "brave" in navigator) return "brave";
  if (brands.some((brand) => brand.includes("vivaldi"))) return "vivaldi";
  return "chrome";
}

/** The Google account this browser profile is signed in to (Chrome sync), if any. */
export async function profileEmail() {
  try {
    const info = await chrome.identity.getProfileUserInfo({ accountStatus: "ANY" });
    return info.email || null;
  } catch {
    return null;
  }
}

/** This profile as reported: the name the owner confirmed in the panel, or a first guess from its Google account. */
async function currentProfile(state) {
  if (state.profile?.name) return state.profile;
  const email = await profileEmail();
  return { name: email ? email.split("@")[0] : "Default", browser: detectBrowser() };
}

export async function saveProfile(input) {
  const name = String(input.name ?? "").trim().slice(0, 60);
  const browser = BROWSERS.has(input.browser) ? input.browser : detectBrowser();
  if (!name) throw new AgentError("profile");
  await saveState({ profile: { name, browser } });
}

export async function setDiscover(discover) {
  await saveState({ discover: Boolean(discover) });
}

function applyHello(connection, hello) {
  connection.workspace = hello?.workspace ?? connection.workspace ?? "";
  connection.device = hello?.device?.name ?? connection.device ?? null;
  connection.desktop = Boolean(hello?.computer);
}

async function reportTo(connection, hello, report) {
  const { sessions, checked } = await sweep(hello.sites ?? [], { discover: report.discover });
  const summary = await call(connection, "/api/ingest/report", {
    agent: { kind: "extension", version: VERSION },
    browser: report.profile.browser,
    hostname: report.computer ?? undefined,
    profile: { name: report.profile.name, email: report.email },
    sessions,
    checked,
  });
  connection.lastReportAt = new Date().toISOString();
  connection.result = { confirmed: summary?.confirmed ?? 0, findings: summary?.findings ?? 0, review: summary?.review ?? 0 };
  connection.error = null;
}

let running = null;

/**
 * Reports this profile to every connection. Greets each first, so a computer name learned from AkunMu Desktop goes
 * with every report of the same run. One run at a time: a second call while one runs waits for it.
 */
export function reportAll() {
  running ??= (async () => {
    const state = await loadState();
    const profile = await currentProfile(state);
    const email = await profileEmail();
    const greeted = [];
    let computer = state.computer;
    for (const connection of state.connections) {
      try {
        const hello = await call(connection, "/api/ingest/hello");
        applyHello(connection, hello);
        if (hello?.computer) computer = hello.computer;
        greeted.push([connection, hello]);
      } catch (error) {
        connection.error = error instanceof AgentError ? error.code : "network";
      }
    }
    for (const [connection, hello] of greeted) {
      try {
        await reportTo(connection, hello, { profile, email, computer, discover: state.discover });
      } catch (error) {
        connection.error = error instanceof AgentError ? error.code : "network";
      }
    }
    // Connections removed and a profile renamed while this ran stay as the panel left them.
    const latest = await loadState();
    const reported = new Map(state.connections.map((connection) => [connection.id, connection]));
    await saveState({ connections: latest.connections.map((connection) => reported.get(connection.id) ?? connection), computer, profile: latest.profile ?? profile });
  })().finally(() => {
    running = null;
  });
  return running;
}

/** Adds (or renews) a connection: checks the key with the server, then reports right away. */
export async function connect(input) {
  const address = normalizeAddress(input.address);
  const key = String(input.key ?? "").trim();
  if (!KEY_PATTERN.test(key)) throw new AgentError("key");
  const connection = { id: crypto.randomUUID(), address, key, workspace: "", device: null, desktop: false, lastReportAt: null, result: null, error: null };
  const hello = await call(connection, "/api/ingest/hello");
  applyHello(connection, hello);
  const state = await loadState();
  await saveState({
    connections: [...state.connections.filter((other) => other.address !== address), connection],
    computer: hello?.computer ?? state.computer,
  });
  // A run that started before this connection existed would leave it out: wait for it, then report again.
  if (running) await running.catch(() => undefined);
  await reportAll();
  return connection.id;
}

export async function disconnect(id) {
  const state = await loadState();
  await saveState({ connections: state.connections.filter((connection) => connection.id !== id) });
}
