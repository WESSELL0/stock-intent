const DAY_MS = 86_400_000;
const SHANGHAI_OFFSET_MS = 8 * 3_600_000;
export const STALE_AFTER_CALENDAR_DAYS = 3;

/** A conservative calendar-day warning; exchange holidays may be flagged early. */
export function snapshotFreshness(marketDate: string, now = new Date()) {
  const evaluatedOn = new Date(now.getTime() + SHANGHAI_OFFSET_MS).toISOString().slice(0, 10);
  const ageCalendarDays = Math.round((Date.parse(`${evaluatedOn}T00:00:00Z`) - Date.parse(`${marketDate}T00:00:00Z`)) / DAY_MS);
  if (!Number.isFinite(ageCalendarDays)) throw new Error("SNAPSHOT_MARKET_DATE_INVALID");
  return {
    evaluated_on: evaluatedOn,
    age_calendar_days: ageCalendarDays,
    stale_after_days: STALE_AFTER_CALENDAR_DAYS,
    date_anomaly: ageCalendarDays < 0,
    stale: ageCalendarDays < 0 || ageCalendarDays > STALE_AFTER_CALENDAR_DAYS,
  };
}
