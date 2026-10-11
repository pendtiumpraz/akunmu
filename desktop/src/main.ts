import { BrowserWindow, Menu, Notification, app, dialog, nativeTheme, safeStorage, screen, session, shell, utilityProcess, type UtilityProcess } from "electron";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync, type WriteStream } from "node:fs";
import { createServer as createHttpServer, request as httpRequest, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createServer } from "node:net";
import path from "node:path";
import { format, languageFor, messagesFor, type Language, type Messages } from "./messages";

/**
 * AkunMu for Windows and Linux. The shell starts two processes and opens a window on them:
 * - the database (db-host.ts): PGlite, its data in the user's profile, migrated to the app's schema on every start;
 * - the app's own server: the Next.js standalone build made by scripts/build.mjs, on a free port at 127.0.0.1.
 * The window opens the app with a key made for this launch, which signs the local owner in (src/app/desktop/start).
 * Two doors let the browser in: a fixed local port the browser extension reports to (only the ingest API), and
 * akunmu://open links from the web app, which open a browser profile of this computer at a site.
 * Quitting stops the server, then closes the database cleanly.
 */

const LOCAL_HOST = "127.0.0.1";
const APP_ID = "app.akunmu.desktop";
const START_TIMEOUT_MS = 60_000;
const STOP_TIMEOUT_MS = 8_000;
const PROTOCOL = "akunmu";
/** The extension's address is http://127.0.0.1:<the first free one>, shown on the app's Download & connect page. */
const AGENT_PORTS = [47821, 47822, 47823, 47824, 47825];
/** The only paths the extension's port forwards to the app. */
const AGENT_PATHS = new Set(["/api/ingest/hello", "/api/ingest/report"]);
/** What an akunmu://open link may carry on to the app (src/app/desktop/open). */
const OPEN_PARAMS = ["browser", "profile", "directory", "email", "host", "url"];

// Data lives in the user's profile, or where AKUNMU_DATA_DIR points (a copy kept elsewhere, or a test run).
const customDataDir = process.env.AKUNMU_DATA_DIR?.trim();
if (customDataDir) app.setPath("userData", path.resolve(customDataDir));

const dataDir = () => app.getPath("userData");
const logsDir = () => path.join(dataDir(), "logs");
/** Where the server and the migrations are: the app's resources once packaged, desktop/app while developing. */
const resourcesDir = () => (app.isPackaged ? process.resourcesPath : path.join(__dirname, "..", "app"));
const staticDir = path.join(__dirname, "..", "static");

let language: Language = "en";
let messages: Messages = messagesFor("en");
let mainWindow: BrowserWindow | null = null;
let database: UtilityProcess | null = null;
let server: UtilityProcess | null = null;
let log: WriteStream | null = null;
let running = false;
let stopping = false;
let stopped = false;
let agentServer: Server | null = null;
/** The app's server, once it answers: where it runs and the key it was opened with. */
let appPort = 0;
let appKey = "";
/** An akunmu:// link that arrived before the app was up (it started the app). */
let pendingLink: string | null = null;

class LaunchError extends Error {
  constructor(
    readonly part: "database" | "server",
    cause: unknown,
  ) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
  }
}

function write(source: string, text: string): void {
  const line = text.endsWith("\n") ? text : `${text}\n`;
  log?.write(`${new Date().toISOString()} [${source}] ${line}`);
}

function attachOutput(child: UtilityProcess, source: string): void {
  child.stdout?.on("data", (chunk: Buffer) => write(source, chunk.toString()));
  child.stderr?.on("data", (chunk: Buffer) => write(source, chunk.toString()));
}

/** Shows what went wrong and where the logs are, then quits. */
function fail(title: string, message: string): void {
  if (stopping) return;
  dialog.showErrorBox(title, `${message}\n\n${messages.logsAt}\n${logsDir()}`);
  app.quit();
}

/** A part stopped on its own after the app was up. */
function watchExit(child: UtilityProcess, part: string): void {
  child.once("exit", (code: number) => {
    write("main", `${part} exited with code ${code}`);
    if (running && !stopping) fail(messages.stoppedTitle, messages.stopped);
  });
}

/**
 * The key the app encrypts the secrets it stores with (AI keys). Made on the first launch and kept encrypted by
 * Windows for this user (DPAPI, through safeStorage) when available.
 */
function appSecret(): string {
  const file = path.join(dataDir(), "secret.json");
  if (existsSync(file)) {
    const stored = JSON.parse(readFileSync(file, "utf8")) as { protected: boolean; value: string };
    return stored.protected ? safeStorage.decryptString(Buffer.from(stored.value, "base64")) : stored.value;
  }
  const secret = randomBytes(48).toString("base64url");
  const canProtect = safeStorage.isEncryptionAvailable();
  const value = canProtect ? safeStorage.encryptString(secret).toString("base64") : secret;
  writeFileSync(file, JSON.stringify({ protected: canProtect, value }), { mode: 0o600 });
  return secret;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, LOCAL_HOST, () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close(() => (port > 0 ? resolve(port) : reject(new Error("No free port."))));
    });
  });
}

function startDatabase(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = utilityProcess.fork(path.join(__dirname, "db-host.js"), [], { serviceName: "AkunMu database", stdio: "pipe" });
    database = child;
    attachOutput(child, "database");
    const timer = setTimeout(() => reject(new Error("The database did not start in time.")), START_TIMEOUT_MS);
    child.on("message", (message: { type: string; message?: string }) => {
      if (message.type !== "ready" && message.type !== "failed") return;
      clearTimeout(timer);
      if (message.type === "ready") resolve();
      else reject(new Error(message.message ?? "The database failed."));
    });
    child.once("exit", () => reject(new Error("The database stopped while starting.")));
    watchExit(child, "database");
    child.postMessage({ type: "start", dataDir: path.join(dataDir(), "database"), migrationsDir: path.join(resourcesDir(), "migrations"), port });
  });
}

/** Waits until the server answers at all (any status), or gives up. */
async function waitForServer(url: string, hasExited: () => boolean): Promise<void> {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (hasExited()) throw new Error("The server stopped while starting.");
    try {
      await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(2_000) });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  throw new Error("The server did not start in time.");
}

/** Hands an extension's request on to the app's server, for the ingest API only. */
function forwardIngest(request: IncomingMessage, response: ServerResponse): void {
  const target = request.url ?? "/";
  if (!appPort || !AGENT_PATHS.has(target.split("?")[0])) {
    response.writeHead(404).end();
    return;
  }
  const upstream = httpRequest(
    { host: LOCAL_HOST, port: appPort, path: target, method: request.method, headers: { ...request.headers, host: `${LOCAL_HOST}:${appPort}` } },
    (answer) => {
      response.writeHead(answer.statusCode ?? 502, answer.headers);
      answer.pipe(response);
    },
  );
  upstream.on("error", () => {
    if (!response.headersSent) response.writeHead(502);
    response.end();
  });
  request.pipe(upstream);
}

/**
 * Opens the extension's port: the first free one of AGENT_PORTS at 127.0.0.1, so its address rarely changes even
 * though the app's server moves to a new port every launch. Null when all are taken (the extension then can't report).
 */
async function startAgentPort(): Promise<number | null> {
  for (const port of AGENT_PORTS) {
    const candidate = createHttpServer(forwardIngest);
    const opened = await new Promise<boolean>((resolve) => {
      candidate.once("error", () => resolve(false));
      candidate.listen(port, LOCAL_HOST, () => resolve(true));
    });
    if (opened) {
      agentServer = candidate;
      return port;
    }
  }
  return null;
}

async function startServer(port: number, databasePort: number, key: string, agentPort: number | null): Promise<void> {
  const serverDir = path.join(resourcesDir(), "server");
  const databaseUrl = `postgres://postgres:postgres@${LOCAL_HOST}:${databasePort}/postgres`;
  // The user's own environment, without anything that could point the server elsewhere.
  const { NODE_OPTIONS: _options, ...inherited } = process.env;
  const child = utilityProcess.fork(path.join(serverDir, "server.js"), [], {
    cwd: serverDir,
    serviceName: "AkunMu server",
    stdio: "pipe",
    env: {
      ...inherited,
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
      PORT: String(port),
      HOSTNAME: LOCAL_HOST,
      DATABASE_URL: databaseUrl,
      DATABASE_URL_UNPOOLED: databaseUrl,
      POSTGRES_URL: databaseUrl,
      POSTGRES_URL_NON_POOLING: databaseUrl,
      DATABASE_POOL_MAX: "1",
      APP_SECRET: appSecret(),
      DEFAULT_LOCALE: language,
      AKUNMU_DESKTOP: "1",
      AKUNMU_DESKTOP_TOKEN: key,
      AKUNMU_AGENT_ADDRESS: agentPort ? `http://${LOCAL_HOST}:${agentPort}` : "",
    },
  });
  server = child;
  attachOutput(child, "server");
  watchExit(child, "server");
  // `pid` stays undefined until the process has spawned, so an exit is what tells it failed.
  let exited = false;
  child.once("exit", () => {
    exited = true;
  });
  await waitForServer(`http://${LOCAL_HOST}:${port}/desktop/start`, () => exited);
}

type WindowState = { width: number; height: number; maximized: boolean };

function readWindowState(): WindowState {
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
  const fit = (state: WindowState) => ({ ...state, width: Math.min(state.width, screenWidth), height: Math.min(state.height, screenHeight) });
  try {
    const saved = JSON.parse(readFileSync(path.join(dataDir(), "window.json"), "utf8")) as Partial<WindowState>;
    if (typeof saved.width === "number" && typeof saved.height === "number") return fit({ width: saved.width, height: saved.height, maximized: saved.maximized === true });
  } catch {
    // First launch, or an unreadable file: maximized, since the trees want the room.
  }
  return fit({ width: 1360, height: 880, maximized: true });
}

function saveWindowState(window: BrowserWindow): void {
  const { width, height } = window.getNormalBounds();
  try {
    writeFileSync(path.join(dataDir(), "window.json"), JSON.stringify({ width, height, maximized: window.isMaximized() }));
  } catch (error) {
    write("main", `window state not saved: ${String(error)}`);
  }
}

function createWindow(): BrowserWindow {
  const state = readWindowState();
  const dark = nativeTheme.shouldUseDarkColors;
  const window = new BrowserWindow({
    width: state.width,
    height: state.height,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: "AkunMu",
    autoHideMenuBar: true,
    backgroundColor: dark ? "#0a0f14" : "#f4f6f8",
    icon: path.join(staticDir, "icon.png"),
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  });
  if (state.maximized) window.maximize();
  window.once("ready-to-show", () => window.show());
  window.on("close", () => saveWindowState(window));
  void window.loadFile(path.join(staticDir, "loading.html"), { query: { text: messages.starting, theme: dark ? "dark" : "light" } });
  return window;
}

/**
 * Keeps the window on the app: other sites open in the user's browser, and a sign-in page (the session ended, or
 * signed out) signs the owner in again, at most a few times in a row.
 */
function guardNavigation(window: BrowserWindow, origin: string, startUrl: string): void {
  const contents = window.webContents;
  const isApp = (url: string) => url === origin || url.startsWith(`${origin}/`);
  // The server may name itself localhost; the session cookie lives on 127.0.0.1, so such URLs are brought back.
  const alias = origin.replace(LOCAL_HOST, "localhost");
  const backToApp = (url: string) => (url === alias || url.startsWith(`${alias}/`) ? origin + url.slice(alias.length) : null);
  contents.on("will-redirect", (event, url) => {
    const fixed = backToApp(url);
    if (!fixed) return;
    event.preventDefault();
    void window.loadURL(fixed);
  });
  const openOutside = (url: string) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
  };
  contents.setWindowOpenHandler(({ url }) => {
    if (isApp(url)) void window.loadURL(url);
    else openOutside(url);
    return { action: "deny" };
  });
  contents.on("will-navigate", (event, url) => {
    if (isApp(url)) return;
    event.preventDefault();
    const fixed = backToApp(url);
    if (fixed) void window.loadURL(fixed);
    else openOutside(url);
  });
  let recent: number[] = [];
  const signInAgain = (url: string) => {
    if (!isApp(url)) return;
    const { pathname } = new URL(url);
    if (pathname !== "/login" && pathname !== "/signup") return;
    const now = Date.now();
    recent = [...recent.filter((at) => now - at < 15_000), now];
    if (recent.length > 3) fail(messages.errorTitle, messages.signInLoop);
    else void window.loadURL(startUrl);
  };
  contents.on("did-navigate", (_event, url) => signInAgain(url));
  contents.on("did-navigate-in-page", (_event, url) => signInAgain(url));
}

function notify(title: string, body: string): void {
  if (Notification.isSupported()) new Notification({ title, body, icon: path.join(staticDir, "icon.png") }).show();
  else void dialog.showMessageBox({ type: "info", title, message: body });
}

const isAppLink = (value: string) => value.toLowerCase().startsWith(`${PROTOCOL}://`);

/**
 * An akunmu://open link from the web app ("Open in profile"): the app opens that browser profile of this computer
 * at the site, if it is here (src/app/desktop/open checks the computer name and the profile). The window stays put.
 */
async function openLink(link: string): Promise<void> {
  if (!running) {
    pendingLink = link;
    return;
  }
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return;
  }
  if (url.hostname !== "open") return;
  const target = new URL(`http://${LOCAL_HOST}:${appPort}/desktop/open`);
  for (const name of OPEN_PARAMS) {
    const value = url.searchParams.get(name);
    if (value) target.searchParams.set(name, value);
  }
  target.searchParams.set("key", appKey);
  try {
    const response = await fetch(target, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) notify(messages.openFailedTitle, messages.profileNotHere);
  } catch (error) {
    write("main", `open link failed: ${String(error)}`);
    notify(messages.openFailedTitle, messages.openFailed);
  }
}

/** Lets akunmu:// links reach this app: the system's handler for them (and, on Linux, a menu entry that names it). */
function registerProtocol(): void {
  if (process.defaultApp) {
    // Started with `electron .` while developing: the link must start electron with this app's folder.
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1] ?? ".")]);
    return;
  }
  if (process.platform === "linux") installLinuxEntry();
  app.setAsDefaultProtocolClient(PROTOCOL);
}

/** The .tar.gz has no installer: the app adds its own menu entry, which is also what opens akunmu:// links. */
function installLinuxEntry(): void {
  const directory = path.join(app.getPath("home"), ".local", "share", "applications");
  const file = path.join(directory, "akunmu.desktop");
  const entry = [
    "[Desktop Entry]",
    "Type=Application",
    "Name=AkunMu",
    `Exec="${process.execPath}" %u`,
    `Icon=${path.join(staticDir, "icon.png")}`,
    "Categories=Utility;",
    `MimeType=x-scheme-handler/${PROTOCOL};`,
    "Terminal=false",
    "",
  ].join("\n");
  try {
    mkdirSync(directory, { recursive: true });
    if (existsSync(file) && readFileSync(file, "utf8") === entry) return;
    writeFileSync(file, entry);
    spawn("xdg-mime", ["default", "akunmu.desktop", `x-scheme-handler/${PROTOCOL}`], { stdio: "ignore" }).on("error", () => undefined);
  } catch (error) {
    write("main", `menu entry not written: ${String(error)}`);
  }
}

function buildMenu(): Menu {
  return Menu.buildFromTemplate([
    {
      label: messages.menuView,
      submenu: [
        { role: "reload", label: messages.reload },
        { type: "separator" },
        { role: "resetZoom", label: messages.actualSize },
        { role: "zoomIn", label: messages.zoomIn },
        { role: "zoomOut", label: messages.zoomOut },
        { type: "separator" },
        { role: "togglefullscreen", label: messages.fullScreen },
      ],
    },
    {
      label: messages.menuHelp,
      submenu: [
        { label: messages.openData, click: () => void shell.openPath(dataDir()) },
        { label: messages.openLogs, click: () => void shell.openPath(logsDir()) },
        { type: "separator" },
        { label: format(messages.version, { version: app.getVersion() }), enabled: false },
      ],
    },
  ]);
}

async function launch(): Promise<void> {
  language = languageFor([app.getLocale(), app.getSystemLocale(), ...app.getPreferredSystemLanguages()], app.getLocaleCountryCode());
  messages = messagesFor(language);
  // The app picks its language from the request, so the window asks in the shell's language; a language chosen in the
  // app (kept in a cookie) still wins.
  session.defaultSession.setUserAgent(session.defaultSession.getUserAgent(), language === "id" ? "id-ID,id,en" : "en-US,en");
  mkdirSync(logsDir(), { recursive: true });
  log = createWriteStream(path.join(logsDir(), "akunmu.log"), { flags: "w" });
  write("main", `AkunMu ${app.getVersion()} on Electron ${process.versions.electron}; data in ${dataDir()}`);
  Menu.setApplicationMenu(buildMenu());
  const window = createWindow();
  mainWindow = window;
  try {
    const databasePort = await freePort();
    await startDatabase(databasePort).catch((error: unknown) => {
      throw new LaunchError("database", error);
    });
    const serverPort = await freePort();
    const key = randomBytes(32).toString("base64url");
    const agentPort = await startAgentPort();
    if (!agentPort) write("main", `no free port for the browser extension (${AGENT_PORTS.join(", ")})`);
    await startServer(serverPort, databasePort, key, agentPort).catch((error: unknown) => {
      throw new LaunchError("server", error);
    });
    appPort = serverPort;
    appKey = key;
    const origin = `http://${LOCAL_HOST}:${serverPort}`;
    const startUrl = `${origin}/desktop/start?key=${key}`;
    guardNavigation(window, origin, startUrl);
    running = true;
    write("main", `ready on ${origin}${agentPort ? `; extension port ${agentPort}` : ""}`);
    await window.loadURL(startUrl);
    if (pendingLink) {
      const link = pendingLink;
      pendingLink = null;
      void openLink(link);
    }
  } catch (error) {
    write("main", error instanceof Error ? (error.stack ?? error.message) : String(error));
    const part = error instanceof LaunchError ? error.part : "server";
    fail(messages.errorTitle, part === "database" ? messages.databaseFailed : messages.serverFailed);
  }
}

/** Stops the server, then asks the database to close (and ends it if it does not in time). */
async function stopServices(): Promise<void> {
  agentServer?.close();
  server?.kill();
  const child = database;
  if (!child || child.pid === undefined) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      child.kill();
      resolve();
    }, STOP_TIMEOUT_MS);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    child.postMessage({ type: "stop" });
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.setAppUserModelId(APP_ID);
  // A copy kept elsewhere (or a test run, AKUNMU_DATA_DIR) leaves the system's akunmu:// links to the installed app.
  if (!customDataDir) registerProtocol();
  // Started by an akunmu:// link (Windows and Linux pass it as an argument).
  pendingLink = process.argv.find(isAppLink) ?? null;
  app.on("second-instance", (_event, argv) => {
    const link = argv.find(isAppLink);
    if (link) {
      // A link opens a browser profile; the window stays where it is.
      void openLink(link);
      return;
    }
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", (event) => {
    if (stopped) return;
    event.preventDefault();
    if (stopping) return;
    stopping = true;
    void stopServices().finally(() => {
      stopped = true;
      write("main", "stopped");
      log?.end();
      app.quit();
    });
  });
  process.on("uncaughtException", (error) => write("main", error.stack ?? error.message));
  void app.whenReady().then(launch);
}
