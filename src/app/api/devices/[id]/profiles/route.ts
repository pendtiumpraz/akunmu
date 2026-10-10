import { staffRoute } from "@/server/route";
import { createProfile } from "@/modules/devices/service";
import { profileInputSchema } from "@/modules/devices/validation";
import { parseId, readJson } from "@/shared/http/request";
import { created } from "@/shared/http/respond";
import { parseWith } from "@/shared/http/validation";

export const POST = staffRoute<{ id: string }>("map.write", async ({ request, params, staff, i18n }) => {
  const input = parseWith(profileInputSchema, await readJson(request));
  return created(await createProfile(parseId(params.id), input, staff.user.id), i18n.t("api.created"));
});
