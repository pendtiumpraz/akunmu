import { staffRoute } from "@/server/route";
import { overview } from "@/modules/signins/service";
import { ok } from "@/shared/http/respond";

export const GET = staffRoute("map.read", async () => ok(await overview()));
