import { staffRoute } from "@/server/route";
import { deleteProject, projectDetail, updateProject } from "@/modules/projects/service";
import { projectUpdateSchema } from "@/modules/projects/validation";
import { parseId, readJson } from "@/shared/http/request";
import { ok } from "@/shared/http/respond";
import { parseWith } from "@/shared/http/validation";

export const GET = staffRoute<{ id: string }>("map.read", async ({ params }) => ok(await projectDetail(parseId(params.id))));

export const PATCH = staffRoute<{ id: string }>("map.write", async ({ request, params, staff, i18n }) => {
  const input = parseWith(projectUpdateSchema, await readJson(request));
  return ok(await updateProject(parseId(params.id), input, staff.user.id), i18n.t("api.updated"));
});

/** Deletes the project, its links to sessions and its screenshot. */
export const DELETE = staffRoute<{ id: string }>("map.write", async ({ params, staff, i18n }) =>
  ok(await deleteProject(parseId(params.id), staff.user.id), i18n.t("api.projectDeleted")),
);
