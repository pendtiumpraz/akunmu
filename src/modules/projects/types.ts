/** Project types shared by the server and the browser (no database imports). */

/** A project as the screens receive it: `screenshot` is an address an <img> can load, or null. */
export type ProjectView = {
  id: number;
  name: string;
  url: string | null;
  notes: string | null;
  screenshot: string | null;
  screenshotAt: string | null;
  /** The login sessions working on it. */
  signInIds: number[];
};

/** What a tree draws for a project hanging off a session. */
export type TreeProject = Pick<ProjectView, "id" | "name" | "url" | "screenshot">;

/** Vercel's function body limit is 4.5 MB; a screenshot stays under it. */
export const MAX_SCREENSHOT_BYTES = 4 * 1024 * 1024;

/** The image types a file picker offers for a screenshot (the server still checks each file's signature). */
export const SCREENSHOT_ACCEPT = "image/png,image/jpeg,image/webp";
