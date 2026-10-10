import { localeDefinition, type Locale } from "./locales";

/** Locale-aware formatting built only on Intl, so new languages need no formatting code. */
export type Formatter = {
  dateTime: (value: Date | string, timeZone?: string) => string;
  date: (value: Date | string, timeZone?: string) => string;
  time: (value: Date | string, timeZone?: string) => string;
  dateRange: (start: Date | string, end: Date | string, timeZone?: string) => string;
  number: (value: number) => string;
  relativeDays: (value: Date | string) => string;
  /** Any Intl date pattern, e.g. { month: "short" } for calendar badges. */
  custom: (value: Date | string, options: Intl.DateTimeFormatOptions) => string;
};

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export function createFormatter(locale: Locale): Formatter {
  const tag = localeDefinition(locale).intl;
  return {
    dateTime: (value, timeZone) =>
      new Intl.DateTimeFormat(tag, { dateStyle: "medium", timeStyle: "short", timeZone }).format(toDate(value)),
    date: (value, timeZone) =>
      new Intl.DateTimeFormat(tag, { dateStyle: "full", timeZone }).format(toDate(value)),
    time: (value, timeZone) =>
      new Intl.DateTimeFormat(tag, { timeStyle: "short", timeZone }).format(toDate(value)),
    dateRange: (start, end, timeZone) =>
      new Intl.DateTimeFormat(tag, { dateStyle: "medium", timeStyle: "short", timeZone }).formatRange(
        toDate(start),
        toDate(end),
      ),
    number: (value) => new Intl.NumberFormat(tag).format(value),
    relativeDays: (value) => {
      const days = Math.round((toDate(value).getTime() - Date.now()) / 86_400_000);
      return new Intl.RelativeTimeFormat(tag, { numeric: "auto" }).format(days, "day");
    },
    custom: (value, options) => new Intl.DateTimeFormat(tag, options).format(toDate(value)),
  };
}
