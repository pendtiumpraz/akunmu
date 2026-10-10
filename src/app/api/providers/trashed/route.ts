import { staffRoute } from "@/server/route";
import { listProvidersView } from "@/modules/accounts/service";
import { ok } from "@/shared/http/respond";

export const GET = staffRoute("map.read", async () => ok(await listProvidersView({ trashed: true })));
