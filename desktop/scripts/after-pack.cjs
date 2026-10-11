// electron-builder afterPack hook: copies the app's server and migrations (staged in desktop/app by build.mjs) into
// the packaged resources exactly as they are. electron-builder's own copying (extraResources) leaves out node_modules
// and dot folders such as .next-desktop, which the server cannot run without.
exports.default = async function afterPack(context) {
  const { cpSync, existsSync } = await import("node:fs");
  const { join } = await import("node:path");
  const stage = join(__dirname, "..", "app");
  const resources = join(context.appOutDir, "resources");
  for (const part of ["server", "migrations"]) {
    const source = join(stage, part);
    if (!existsSync(source)) throw new Error(`Nothing staged at ${source}; run scripts/build.mjs.`);
    cpSync(source, join(resources, part), { recursive: true });
  }
  if (!existsSync(join(resources, "server", "node_modules", "next"))) throw new Error("The packaged server has no next module.");
};
