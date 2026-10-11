import { listFindingsView } from "@/modules/connect/service";
import { staffRoute } from "@/server/route";
import { ok } from "@/shared/http/respond";

/** What the extension or the desktop app found that is not in the map yet. */
export const GET = staffRoute("map.read", async () => ok(await listFindingsView(), "", 200, { "Cache-Control": "no-store" }));
