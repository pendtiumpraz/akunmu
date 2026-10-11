import { scanThisComputer } from "@/modules/connect/service";
import { staffRoute } from "@/server/route";
import { isDesktop } from "@/shared/env";
import { notFound } from "@/shared/http/errors";
import { ok } from "@/shared/http/respond";

/** Desktop app only: looks at this computer's browser profiles; what is new becomes findings. */
export const POST = staffRoute("map.write", async ({ i18n }) => {
  if (!isDesktop()) throw notFound();
  const result = await scanThisComputer();
  return ok(result, i18n.t("api.scanned", { profiles: result.profiles, findings: result.findings }));
});
