import { revokeIngestToken } from "@/modules/connect/service";
import { staffRoute } from "@/server/route";
import { parseId } from "@/shared/http/request";
import { ok } from "@/shared/http/respond";

/** Revokes a key: the extension using it can no longer report. */
export const DELETE = staffRoute<{ id: string }>("settings.manage", async ({ params, staff, i18n }) => {
  await revokeIngestToken(parseId(params.id), staff.user.id);
  return ok(null, i18n.t("api.keyRevoked"));
});
