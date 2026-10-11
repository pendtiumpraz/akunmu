import { openLinkedProfile, openRecordedProfile } from "@/modules/connect/service";
import { openProfileSchema } from "@/modules/connect/validation";
import { staffRoute } from "@/server/route";
import { isDesktop } from "@/shared/env";
import { conflict, notFound } from "@/shared/http/errors";
import { readJson } from "@/shared/http/request";
import { ok } from "@/shared/http/respond";
import { parseWith } from "@/shared/http/validation";

/**
 * Desktop app only: opens a browser profile on this computer at a site (where its account is signed in): a recorded
 * profile, or one of the computer's own by its folder.
 */
export const POST = staffRoute("map.read", async ({ request, i18n }) => {
  if (!isDesktop()) throw notFound();
  const input = parseWith(openProfileSchema, await readJson(request));
  const url = input.url ?? null;
  const opened =
    input.profileId !== undefined
      ? await openRecordedProfile(input.profileId, url)
      : input.browser
        ? openLinkedProfile({ browser: input.browser, directory: input.directory }, url)
        : false;
  if (!opened) throw conflict("errors.profileNotHere");
  return ok(null, i18n.t("api.profileOpened"));
});
