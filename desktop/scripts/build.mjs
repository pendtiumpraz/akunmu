// Builds AkunMu for Windows. Run from desktop/: node scripts/build.mjs [--skip-next] [--no-package]
// 1. the app's desktop server: `next build` with AKUNMU_DESKTOP=1 (standalone, into .next-desktop);
// 2. stages it with its static files and the database migrations into desktop/app;
// 3. refuses to go on if any environment file or value of the web app's .env got into the stage;
// 4. compiles the shell (src → dist);
// 5. packages the installer and a zip into desktop/release (electron-builder).
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

const desktop = path.resolve(import.meta.dirname, "..");
const root = path.resolve(desktop, "..");
const stage = path.join(desktop, "app");
const flags = new Set(process.argv.slice(2));

function run(label, command, args, options = {}) {
  console.log(`\n> ${label}`);
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.status !== 0) throw new Error(`${label} failed (exit ${result.status ?? result.signal}).`);
}

// The build never talks to a database and must not carry the web app's settings: placeholders override the root .env.
const placeholderDatabase = "postgres://desktop:desktop@127.0.0.1:9/desktop";
const buildEnv = {
  ...process.env,
  AKUNMU_DESKTOP: "1",
  NODE_ENV: "production",
  NEXT_TELEMETRY_DISABLED: "1",
  DATABASE_URL: placeholderDatabase,
  DATABASE_URL_UNPOOLED: placeholderDatabase,
  POSTGRES_URL: placeholderDatabase,
  POSTGRES_URL_NON_POOLING: placeholderDatabase,
  APP_SECRET: "desktop-build-placeholder-not-a-secret-0123456789",
  BLOB_READ_WRITE_TOKEN: "",
};

if (!flags.has("--skip-next")) {
  run("next build (desktop)", process.execPath, [path.join(root, "node_modules", "next", "dist", "bin", "next"), "build"], { cwd: root, env: buildEnv });
}

const built = path.join(root, ".next-desktop");
if (!existsSync(path.join(built, "standalone", "server.js"))) throw new Error("No desktop server build in .next-desktop/standalone.");

console.log("\n> staging desktop/app");
rmSync(stage, { recursive: true, force: true });
const noEnvFiles = (source) => !path.basename(source).startsWith(".env");
cpSync(path.join(built, "standalone"), path.join(stage, "server"), { recursive: true, filter: noEnvFiles });
cpSync(path.join(built, "static"), path.join(stage, "server", ".next-desktop", "static"), { recursive: true });
cpSync(path.join(root, "public"), path.join(stage, "server", "public"), { recursive: true });
cpSync(path.join(root, "drizzle", "migrations"), path.join(stage, "migrations"), { recursive: true });

console.log("\n> checking the stage for secrets");
function filesIn(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const full = path.join(directory, entry);
    return statSync(full).isDirectory() ? filesIn(full) : [full];
  });
}
const staged = filesIn(stage);
const envFiles = staged.filter((file) => path.basename(file).startsWith(".env"));
if (envFiles.length > 0) throw new Error(`Environment files in the stage: ${envFiles.join(", ")}`);
const rootEnv = path.join(root, ".env");
const values = existsSync(rootEnv)
  ? Object.entries(parseEnv(readFileSync(rootEnv, "utf8"))).filter(([, value]) => typeof value === "string" && value.length >= 8)
  : [];
const leaked = new Set();
for (const file of staged) {
  const text = readFileSync(file).toString("latin1");
  for (const [key, value] of values) if (text.includes(value)) leaked.add(key);
}
if (leaked.size > 0) throw new Error(`Values of .env found in the stage (keys only): ${[...leaked].join(", ")}`);
console.log(`${staged.length} files staged, no environment files, none of ${values.length} .env values present.`);

run("compile the shell", process.execPath, [path.join(desktop, "node_modules", "typescript", "bin", "tsc"), "-p", desktop]);

if (!flags.has("--no-package")) {
  run("package (electron-builder)", process.execPath, [path.join(desktop, "node_modules", "electron-builder", "cli.js"), "--win", "--publish", "never"], { cwd: desktop });
}
console.log("\nDone.");
