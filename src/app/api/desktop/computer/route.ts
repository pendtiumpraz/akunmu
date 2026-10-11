import { z } from "zod";
import { linkThisComputer, thisComputerView } from "@/modules/connect/service";
import { staffRoute } from "@/server/route";
import { isDesktop } from "@/shared/env";
import { notFound } from "@/shared/http/errors";
import { readJson } from "@/shared/http/request";
import { ok } from "@/shared/http/respond";
import { parseWith } from "@/shared/http/validation";

/** Desktop app only: this computer (host name, its device) and the browser profiles on it. */
export const GET = staffRoute("map.read", async () => {
  if (!isDesktop()) throw notFound();
  return ok(await thisComputerView(), "", 200, { "Cache-Control": "no-store" });
});

const linkSchema = z.object({ deviceId: z.number().int().positive() });

/** Desktop app only: marks a recorded device as this computer. */
export const POST = staffRoute("map.write", async ({ request, staff, i18n }) => {
  if (!isDesktop()) throw notFound();
  const { deviceId } = parseWith(linkSchema, await readJson(request));
  await linkThisComputer(deviceId, staff.user.id);
  return ok(await thisComputerView(), i18n.t("api.computerLinked"));
});
