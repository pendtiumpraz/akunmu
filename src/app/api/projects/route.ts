import { staffRoute } from "@/server/route";
import { createProject, listProjectsView } from "@/modules/projects/service";
import { projectInputSchema } from "@/modules/projects/validation";
import { readJson } from "@/shared/http/request";
import { created, ok } from "@/shared/http/respond";
import { parseWith } from "@/shared/http/validation";

/** The workspace's projects, each with the sessions working on it. */
export const GET = staffRoute("map.read", async () => ok(await listProjectsView()));

export const POST = staffRoute("map.write", async ({ request, staff, i18n }) => {
  const input = parseWith(projectInputSchema, await readJson(request));
  return created(await createProject(input, staff.user.id), i18n.t("api.created"));
});
