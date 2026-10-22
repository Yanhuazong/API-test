export const EASTERN_TIME_ZONE = "America/Indiana/Indianapolis";

/** "Thu, Oct 29, 9:00 AM EDT" */
export function easternTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: EASTERN_TIME_ZONE, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
  });
}

/** "Thu, Oct 29, 13:00 UTC" */
export function utcTime(iso: string): string {
  const text = new Date(iso).toLocaleString("en-US", {
    timeZone: "UTC", weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  return `${text} UTC`;
}

/** "9:00 AM EDT (13:00 UTC)" style, with weekday and date. */
export function bothZones(iso: string): string {
  return `${easternTime(iso)} (${utcTime(iso)})`;
}

export function easternClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { timeZone: EASTERN_TIME_ZONE, hour: "numeric", minute: "2-digit" });
}

export function easternWeekday(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { timeZone: EASTERN_TIME_ZONE, weekday: "long" });
}

export function easternDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { timeZone: EASTERN_TIME_ZONE, weekday: "long", month: "short", day: "numeric" });
}

export function addUtcDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
