import { NextResponse } from "next/server";
import { desktopHome, desktopPeople } from "@/modules/desktop/service";
import { startStaffSession } from "@/modules/users/session";
import { desktopDefaults, desktopModeParam, isLaunchKey } from "@/server/desktop";

/**
 * The desktop shell opens the app here with its launch key: the person of the asked mode (the default user unless
 * `mode=superadmin`; both made on the first launch) is signed in and lands on their home. Outside the desktop app, or
 * with a wrong key, the page does not exist.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  if (!isLaunchKey(params.get("key"))) return new NextResponse(null, { status: 404 });
  const mode = desktopModeParam(params.get("mode"));
  const people = await desktopPeople(await desktopDefaults());
  await startStaffSession(people[mode], request.headers.get("user-agent"));
  // A relative Location: the standalone server reports its own URL as localhost, while the window is on 127.0.0.1,
  // and the session cookie belongs to the host the window asked.
  return new NextResponse(null, { status: 303, headers: { Location: desktopHome(mode) } });
}
