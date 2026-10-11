import { NextResponse } from "next/server";
import { openLinkedProfile } from "@/modules/connect/service";
import { BROWSERS, type Browser } from "@/modules/devices/types";
import { isLaunchKey } from "@/server/desktop";

/**
 * An akunmu://open link (the "Open in profile" action of the web app) handed over by the desktop shell with its launch
 * key: opens the named profile of this computer at the site. Elsewhere, or with a wrong key, the page does not exist.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  if (!isLaunchKey(params.get("key"))) return new NextResponse(null, { status: 404 });
  const browser = params.get("browser") as Browser | null;
  const url = params.get("url");
  if (!browser || !BROWSERS.includes(browser) || (url !== null && !/^https?:\/\/\S+$/i.test(url))) return NextResponse.json({ opened: false }, { status: 400 });
  const opened = openLinkedProfile({ browser, name: params.get("profile"), directory: params.get("directory"), email: params.get("email"), host: params.get("host") }, url);
  return NextResponse.json({ opened }, { status: opened ? 200 : 409 });
}
