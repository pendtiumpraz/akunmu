/**
 * Time-zone helpers built on Intl (no extra dependency).
 * Instants are stored in UTC; calendar days ("YYYY-MM-DD") and wall-clock values are read in a time zone.
 */

const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Wall-clock parts of an instant in a time zone, as a UTC timestamp. */
function wallClockAsUtc(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  return Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"), value("second"));
}

/** UTC instant → "YYYY-MM-DDTHH:mm" wall clock in a time zone. */
export function utcToZonedLocal(date: Date | string, timeZone: string): string {
  const instant = (date instanceof Date ? date : new Date(date)).getTime();
  const wall = new Date(wallClockAsUtc(instant, timeZone));
  return wall.toISOString().slice(0, 16);
}

/** True for a real calendar date written "YYYY-MM-DD" (no 30 February). */
export function isLocalDate(value: string): boolean {
  const match = LOCAL_DATE.exec(value);
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Calendar date ("YYYY-MM-DD") of an instant in a time zone. */
export function zonedDate(date: Date, timeZone: string): string {
  return utcToZonedLocal(date, timeZone).slice(0, 10);
}
