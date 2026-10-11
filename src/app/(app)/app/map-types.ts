import type { accountDetail, listAccountsView, listProvidersView } from "@/modules/accounts/service";
import type { deviceDetail, listDevicesView } from "@/modules/devices/service";
import type { mapView, overview, treeView } from "@/modules/signins/service";
import type { Json } from "@/shared/http/client";

/** Shapes of the map API responses as the browser receives them (types only; no server code reaches the client). */
export type MapData = Json<Awaited<ReturnType<typeof mapView>>>;
export type MapDevice = MapData["devices"][number];
export type MapProfile = MapData["profiles"][number];
export type MapSignIn = MapData["signIns"][number];
export type OverviewData = Json<Awaited<ReturnType<typeof overview>>>;
export type TreeData = Json<Awaited<ReturnType<typeof treeView>>>;
export type DeviceListItem = Json<Awaited<ReturnType<typeof listDevicesView>>[number]>;
export type DeviceDetail = Json<Awaited<ReturnType<typeof deviceDetail>>>;
export type AccountListItem = Json<Awaited<ReturnType<typeof listAccountsView>>["items"][number]>;
export type AccountDetail = Json<Awaited<ReturnType<typeof accountDetail>>>;
export type ProviderItem = Json<Awaited<ReturnType<typeof listProvidersView>>[number]>;

/**
 * A place on a device, as a key: "p:<profile id>" for a browser profile, "a:<app>" for an app on the device
 * (lowercased), "d" for the device itself without an app name.
 */
export type PlaceKey = string;

export function placeKeyOf(signIn: { profile: { id: number } | null; app: string | null }): PlaceKey {
  if (signIn.profile) return `p:${signIn.profile.id}`;
  if (signIn.app) return `a:${signIn.app.toLowerCase()}`;
  return "d";
}

/** Whether a sign-in should be looked at: marked for review, or not confirmed since `staleBefore`. */
export function needsCheck(signIn: { status: string; review: boolean; lastVerifiedAt: string }, staleBefore: string): boolean {
  return signIn.status === "signed_in" && (signIn.review || signIn.lastVerifiedAt < staleBefore);
}
