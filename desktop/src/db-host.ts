/**
 * The database process, started by main.ts as an Electron utility process. It opens PGlite (PostgreSQL compiled to
 * WebAssembly) on its folder in the user's profile, brings it to the app's schema with the app's own migrations, and
 * serves it over the PostgreSQL protocol on 127.0.0.1 for the app's server. It tells the shell "ready" or "failed",
 * and closes the database cleanly when told to stop.
 */

type StartMessage = { type: "start"; dataDir: string; migrationsDir: string; port: number };
type StopMessage = { type: "stop" };

let close: (() => Promise<void>) | null = null;

async function start({ dataDir, migrationsDir, port }: StartMessage): Promise<void> {
  // ES modules, loaded from this CommonJS process.
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const { PGLiteSocketServer } = await import("@electric-sql/pglite-socket");

  const database = await PGlite.create({ dataDir });
  await migrate(drizzle(database), { migrationsFolder: migrationsDir });
  const server = new PGLiteSocketServer({ db: database, port, host: "127.0.0.1", maxConnections: 4 });
  await server.start();
  close = async () => {
    await server.stop();
    await database.close();
  };
}

process.parentPort.on("message", (event: { data: unknown }) => {
  const message = event.data as StartMessage | StopMessage;
  if (message.type === "start") {
    start(message).then(
      () => process.parentPort.postMessage({ type: "ready" }),
      (error: unknown) => {
        console.error(error);
        process.parentPort.postMessage({ type: "failed", message: error instanceof Error ? error.message : String(error) });
      },
    );
  }
  if (message.type === "stop") {
    const closing = close ? close() : Promise.resolve();
    closing.catch((error: unknown) => console.error(error)).finally(() => process.exit(0));
  }
});
