import { staffRoute } from "@/server/route";
import { projectScreenshot, removeProjectScreenshot, setProjectScreenshot } from "@/modules/projects/service";
import { MAX_SCREENSHOT_BYTES } from "@/modules/projects/types";
import { notFound, validationError } from "@/shared/http/errors";
import { parseId } from "@/shared/http/request";
import { ok } from "@/shared/http/respond";

/** The screenshot: a redirect to its Blob URL, or the local file (desktop). Its address changes with every new one. */
export const GET = staffRoute<{ id: string }>("map.read", async ({ params }) => {
  const found = await projectScreenshot(parseId(params.id));
  if (!found) throw notFound();
  if ("redirect" in found) return Response.redirect(found.redirect, 302);
  return new Response(new Uint8Array(found.data), { headers: { "content-type": found.type, "cache-control": "private, max-age=31536000, immutable" } });
});

/** A new screenshot, sent as multipart form data (field "file"): JPEG, PNG or WebP up to 4 MB. */
export const POST = staffRoute<{ id: string }>("map.write", async ({ request, params, staff, i18n }) => {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_SCREENSHOT_BYTES + 64 * 1024) throw validationError("screenshot", "validation.imageTooLarge");
  const file = (await request.formData().catch(() => null))?.get("file");
  if (!(file instanceof File)) throw validationError("screenshot", "validation.required");
  const data = Buffer.from(await file.arrayBuffer());
  return ok(await setProjectScreenshot(parseId(params.id), data, staff.user.id), i18n.t("api.screenshotSaved"));
});

export const DELETE = staffRoute<{ id: string }>("map.write", async ({ params, staff, i18n }) =>
  ok(await removeProjectScreenshot(parseId(params.id), staff.user.id), i18n.t("api.screenshotRemoved")),
);
