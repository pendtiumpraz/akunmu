import { runRetentionForAll } from "@/modules/compliance/retention";
import { safeEqual } from "@/shared/crypto/tokens";
import { cronSecret } from "@/shared/env";
import { getI18n } from "@/shared/i18n/server";
import { ok } from "@/shared/http/respond";

export const maxDuration = 60;

/**
 * Vercel Cron (see vercel.json), daily: applies the retention periods each workspace and the platform set
 * (UU PDP Art. 42–44; PP 33/2026 Art. 75). Without CRON_SECRET the endpoint stays closed.
 */
export async function GET(request: Request): Promise<Response> {
  const { t } = await getI18n();
  const secret = cronSecret();
  const provided = request.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(provided, `Bearer ${secret}`)) {
    return Response.json({ data: null, message: t("errors.unauthorized") }, { status: 401 });
  }
  return ok(await runRetentionForAll(), t("api.retentionFinished"));
}
