import { staffRoute } from "@/server/route";
import { listDevicesView } from "@/modules/devices/service";
import { ok } from "@/shared/http/respond";

export const GET = staffRoute("map.read", async () => ok(await listDevicesView({ trashed: true })));
