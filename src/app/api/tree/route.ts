import { staffRoute } from "@/server/route";
import { treeView } from "@/modules/signins/service";
import { ok } from "@/shared/http/respond";

/** Every sign-in with where it grew from: what the account trees draw. */
export const GET = staffRoute("map.read", async () => ok(await treeView()));
