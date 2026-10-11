import { ingestHello } from "@/modules/connect/service";
import { ingestRoute } from "@/server/route";
import { ok } from "@/shared/http/respond";

/** The extension checks its key and learns the workspace, the device and the sites to look at. */
export const GET = ingestRoute(async ({ token }) => ok(await ingestHello(token), "", 200, { "Cache-Control": "no-store" }));
