import type { Metadata } from "next";
import { requireStaffPage } from "@/server/staff-page";
import { getI18n } from "@/shared/i18n/server";
import { SignInMap, type MapSelection } from "./sign-in-map";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("nav.map") };
}

function idOf(value: string | string[] | undefined): number | null {
  return typeof value === "string" && /^\d{1,12}$/.test(value) ? Number(value) : null;
}

/** The sign-in map: devices → places → accounts. `?device`, `?place`, `?account` and `?record=1` set where it opens. */
export default async function MapPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaffPage("map.read");
  const params = await searchParams;
  const place = typeof params.place === "string" && /^(p:\d{1,12}|a:.{1,60}|d)$/.test(params.place) ? params.place : null;
  const initial: MapSelection = { deviceId: idOf(params.device), place, accountId: idOf(params.account), view: params.view === "check" ? "check" : "map" };
  return <SignInMap initial={initial} startRecording={params.record === "1"} />;
}
