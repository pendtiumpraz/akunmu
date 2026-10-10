/**
 * Time-zone helpers built on Intl (no extra dependency).
 * Instants are stored in UTC; calendar days ("YYYY-MM-DD") and wall-clock values are read in a time zone.
 */

const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Wall-clock parts of an instant in a time zone, as a UTC timestamp (used to compute offsets). */
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

function offsetAt(instant: number, timeZone: string): number {
  return wallClockAsUtc(instant, timeZone) - Math.floor(instant / 1000) * 1000;
}

/** "2026-11-20T09:00" in "Asia/Jakarta" → 2026-11-20T02:00:00Z. Handles DST transitions. */
export function zonedLocalToUtc(local: string, timeZone: string): Date {
  const match = LOCAL_DATE_TIME.exec(local);
  if (!match) throw new RangeError(`Invalid local date-time: ${local}`);
  const [, year, month, day, hour, minute] = match.map(Number);
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const firstOffset = offsetAt(guess, timeZone);
  let result = guess - firstOffset;
  const secondOffset = offsetAt(result, timeZone);
  if (secondOffset !== firstOffset) result = guess - secondOffset;
  return new Date(result);
}

/** UTC instant → "YYYY-MM-DDTHH:mm" wall clock in a time zone (value for datetime-local inputs). */
export function utcToZonedLocal(date: Date | string, timeZone: string): string {
  const instant = (date instanceof Date ? date : new Date(date)).getTime();
  const wall = new Date(wallClockAsUtc(instant, timeZone));
  return wall.toISOString().slice(0, 16);
}

export function isLocalDateTime(value: string): boolean {
  return LOCAL_DATE_TIME.test(value);
}

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

/** Completed years between a birth date and a calendar date (both "YYYY-MM-DD"). */
export function ageOn(birthDate: string, onDate: string): number {
  const [birthYear, birthMonth, birthDay] = birthDate.split("-").map(Number);
  const [year, month, day] = onDate.split("-").map(Number);
  let age = year - birthYear;
  if (month < birthMonth || (month === birthMonth && day < birthDay)) age -= 1;
  return age;
}

/** Adds whole years to a "YYYY-MM-DD" date; 29 February becomes 28 February in non-leap years. */
export function addYears(dateString: string, years: number): string {
  const [year, month, day] = dateString.split("-").map(Number);
  const target = new Date(Date.UTC(year + years, month - 1, day));
  if (target.getUTCMonth() !== month - 1) target.setUTCDate(0);
  return target.toISOString().slice(0, 10);
}
