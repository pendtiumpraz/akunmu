import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { desktopOwner } from "@/modules/desktop/service";
import { startStaffSession } from "@/modules/users/session";
import { desktopOwnerName, desktopToken } from "@/shared/env";
import { getI18n } from "@/shared/i18n/server";

/** Whether two keys are the same, compared in constant time. */
function sameKey(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The desktop shell opens the app here with its launch key: the owner (made on the first launch) is signed in and
 * lands on the trees. Outside the desktop app, or with a wrong key, the page does not exist.
 */
export async function GET(request: Request) {
  const expected = desktopToken();
  const given = new URL(request.url).searchParams.get("key") ?? "";
  if (!expected || !sameKey(given, expected)) return new NextResponse(null, { status: 404 });
  const { t } = await getI18n();
  const owner = await desktopOwner({ name: desktopOwnerName() ?? t("desktop.ownerName"), workspace: t("desktop.workspaceName") });
  await startStaffSession(owner, request.headers.get("user-agent"));
  // A relative Location: the standalone server reports its own URL as localhost, while the window is on 127.0.0.1,
  // and the session cookie belongs to the host the window asked.
  return new NextResponse(null, { status: 303, headers: { Location: "/app" } });
}
