import { platformRoute } from "@/server/route";
import { restoreTenant } from "@/modules/tenants/service";
import { parseId } from "@/shared/http/request";
import { ok } from "@/shared/http/respond";

export const PATCH = platformRoute<{ id: string }>(async ({ params, staff, i18n }) =>
  ok(await restoreTenant(parseId(params.id), staff.user.id), i18n.t("api.restored")),
);
