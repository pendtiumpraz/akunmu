import { staffRoute } from "@/server/route";
import { createProvider, listProvidersView } from "@/modules/accounts/service";
import { providerInputSchema } from "@/modules/accounts/validation";
import { readJson } from "@/shared/http/request";
import { created, ok } from "@/shared/http/respond";
import { parseWith } from "@/shared/http/validation";

export const GET = staffRoute("map.read", async () => ok(await listProvidersView()));

export const POST = staffRoute("map.write", async ({ request, staff, i18n }) => {
  const input = parseWith(providerInputSchema, await readJson(request));
  return created(await createProvider(input, staff.user.id), i18n.t("api.created"));
});
