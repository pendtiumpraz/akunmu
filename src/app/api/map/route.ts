import { staffRoute } from "@/server/route";
import { mapView } from "@/modules/signins/service";
import { ok } from "@/shared/http/respond";

/** Devices, browser profiles and active sign-ins: everything the sign-in map draws. */
export const GET = staffRoute("map.read", async () => ok(await mapView()));
