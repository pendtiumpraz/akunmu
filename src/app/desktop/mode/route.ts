import { NextResponse } from "next/server";
import { desktopHome, desktopPeople } from "@/modules/desktop/service";
import { endStaffSession, readStaffSession, startStaffSession } from "@/modules/users/session";
import { desktopDefaults, desktopModeParam } from "@/server/desktop";
import { isDesktop } from "@/shared/env";

/**
 * Switches the desktop app between its two modes (the default user and the default superadmin) without signing in:
 * only in the desktop app, and only from one of those two people's own session.
 */
export async function GET(request: Request) {
  if (!isDesktop()) return new NextResponse(null, { status: 404 });
  const staff = await readStaffSession();
  // No session (it ended): the sign-in page, where the shell signs the default user in again.
  if (!staff) return new NextResponse(null, { status: 303, headers: { Location: "/login" } });
  const people = await desktopPeople(await desktopDefaults());
  if (![people.user.id, people.superadmin.id].includes(staff.user.id)) return new NextResponse(null, { status: 403 });
  const mode = desktopModeParam(new URL(request.url).searchParams.get("to"));
  if (people[mode].id !== staff.user.id) {
    await endStaffSession();
    await startStaffSession(people[mode], request.headers.get("user-agent"));
  }
  return new NextResponse(null, { status: 303, headers: { Location: desktopHome(mode) } });
}
