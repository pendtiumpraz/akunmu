import { describe, expect, it } from "vitest";
import { isLocalDate, utcToZonedLocal, zonedDate } from "@/shared/time";

describe("time zones", () => {
  it("reads instants as Jakarta wall-clock time and calendar days", () => {
    expect(utcToZonedLocal(new Date("2026-11-20T02:00:00Z"), "Asia/Jakarta")).toBe("2026-11-20T09:00");
    expect(zonedDate(new Date("2026-11-20T18:30:00Z"), "Asia/Jakarta")).toBe("2026-11-21");
  });

  it("handles daylight saving time", () => {
    expect(utcToZonedLocal(new Date("2026-07-01T13:00:00Z"), "America/New_York")).toBe("2026-07-01T09:00");
    expect(utcToZonedLocal(new Date("2026-01-15T14:00:00Z"), "America/New_York")).toBe("2026-01-15T09:00");
  });

  it("validates calendar dates", () => {
    expect(isLocalDate("2026-02-29")).toBe(false);
    expect(isLocalDate("2028-02-29")).toBe(true);
    expect(isLocalDate("2026-1-5")).toBe(false);
  });
});
