import { createIngestToken, listIngestTokensView } from "@/modules/connect/service";
import { ingestTokenInputSchema } from "@/modules/connect/validation";
import { staffRoute } from "@/server/route";
import { readJson } from "@/shared/http/request";
import { created, ok } from "@/shared/http/respond";
import { parseWith } from "@/shared/http/validation";

/** The workspace's extension keys (never the keys themselves, only their last characters). */
export const GET = staffRoute("settings.manage", async () => ok(await listIngestTokensView(), "", 200, { "Cache-Control": "no-store" }));

/** A new key for one device; the answer is the only time the key is shown. */
export const POST = staffRoute("settings.manage", async ({ request, staff, i18n }) => {
  const input = parseWith(ingestTokenInputSchema, await readJson(request));
  return created(await createIngestToken(input, staff.user.id), i18n.t("api.created"));
});
