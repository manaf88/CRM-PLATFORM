/**
 * Shared time helpers for the admin dashboard.
 *
 * Every "today", "overdue" and "waiting duration" calculation in the dashboard
 * goes through this file. Do not scatter `new Date()` comparisons through the
 * aggregation services — the agency works in one timezone and the boundaries of
 * "today" have to agree across every widget, or two numbers on the same screen
 * end up disagreeing with each other.
 */

/** Agency timezone. Overridable with DASHBOARD_TIMEZONE. */
export const DEFAULT_TIMEZONE = process.env.DASHBOARD_TIMEZONE || 'Asia/Amman';

export type DateRange = {
  start: Date;
  end: Date;
};

/**
 * How far the given instant is ahead of UTC in the given zone, in milliseconds.
 * Derived from Intl rather than a date library — the project has no date
 * dependency and this keeps it that way.
 */
function zoneOffsetMs(date: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const parts: Record<string, string> = {};

  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') {
      parts[part.type] = part.value;
    }
  }

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );

  // The formatter has no millisecond field, so compare at second granularity —
  // otherwise the instant's own milliseconds leak into the offset and push
  // end-of-day boundaries past midnight.
  return asUtc - (date.getTime() - date.getMilliseconds());
}

/** The calendar date, in the given zone, that the instant falls on. */
export function calendarPartsInZone(
  date: Date,
  timeZone: string = DEFAULT_TIMEZONE,
): { year: number; month: number; day: number } {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const [year, month, day] = formatter.format(date).split('-').map(Number);

  return { year, month, day };
}

/**
 * The UTC instant at which the given local wall-clock time occurs in the zone.
 * Applied twice because the offset itself depends on the instant — one pass is
 * wrong across a DST boundary.
 */
function instantFromZonedParts(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  ms: number,
  timeZone: string,
): Date {
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  const firstGuess = new Date(
    naiveUtc - zoneOffsetMs(new Date(naiveUtc), timeZone),
  );

  return new Date(naiveUtc - zoneOffsetMs(firstGuess, timeZone));
}

export function startOfDay(
  date: Date = new Date(),
  timeZone: string = DEFAULT_TIMEZONE,
): Date {
  const { year, month, day } = calendarPartsInZone(date, timeZone);

  return instantFromZonedParts(year, month, day, 0, 0, 0, 0, timeZone);
}

export function endOfDay(
  date: Date = new Date(),
  timeZone: string = DEFAULT_TIMEZONE,
): Date {
  const { year, month, day } = calendarPartsInZone(date, timeZone);

  return instantFromZonedParts(year, month, day, 23, 59, 59, 999, timeZone);
}

/** First and last instant of the calendar month the date falls in. */
export function monthRange(
  year: number,
  month: number,
  timeZone: string = DEFAULT_TIMEZONE,
): DateRange {
  const start = instantFromZonedParts(year, month, 1, 0, 0, 0, 0, timeZone);
  const nextMonthStart = instantFromZonedParts(
    month === 12 ? year + 1 : year,
    month === 12 ? 1 : month + 1,
    1,
    0,
    0,
    0,
    0,
    timeZone,
  );

  return { start, end: new Date(nextMonthStart.getTime() - 1) };
}

export function currentMonth(
  now: Date = new Date(),
  timeZone: string = DEFAULT_TIMEZONE,
): { month: number; year: number } {
  const { year, month } = calendarPartsInZone(now, timeZone);

  return { month, year };
}

/**
 * Resolve the shared `from`/`to` filter into a concrete range.
 * Both default to today, per BE-02. A `from` without a `to` means that one day.
 */
export function resolveDateRange(
  from?: string,
  to?: string,
  timeZone: string = DEFAULT_TIMEZONE,
  now: Date = new Date(),
): DateRange {
  const fromDate = from ? new Date(from) : now;
  const toDate = to ? new Date(to) : fromDate;

  return {
    start: startOfDay(fromDate, timeZone),
    end: endOfDay(toDate, timeZone),
  };
}

/** Whole hours elapsed since the given instant. Never negative. */
export function hoursSince(since: Date, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - since.getTime()) / 3_600_000));
}

/** Whole minutes elapsed since the given instant. Never negative. */
export function minutesSince(since: Date, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - since.getTime()) / 60_000));
}

/** Whole days a due date is past. Never negative. */
export function daysOverdue(dueAt: Date, now: Date = new Date()): number {
  return Math.max(
    0,
    Math.floor((now.getTime() - dueAt.getTime()) / 86_400_000),
  );
}
