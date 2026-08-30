import {
  currentMonth,
  daysOverdue,
  endOfDay,
  hoursSince,
  minutesSince,
  monthRange,
  resolveDateRange,
  startOfDay,
} from './dashboard-time.util';

/**
 * The dashboard's "today", "overdue" and "waiting" numbers all come from these
 * helpers, so a mistake here is wrong on every widget at once. The agency runs
 * on Asia/Amman (UTC+3), which is what makes the day boundaries interesting:
 * midnight there is 21:00 UTC the previous day.
 */
describe('dashboard time helpers', () => {
  const AMMAN = 'Asia/Amman';

  describe('startOfDay / endOfDay', () => {
    it('puts the day boundary at local midnight, not UTC midnight', () => {
      // 30 Aug 2026, 08:00 UTC = 11:00 in Amman
      const instant = new Date('2026-08-30T08:00:00.000Z');

      expect(startOfDay(instant, AMMAN).toISOString()).toBe(
        '2026-08-29T21:00:00.000Z',
      );
      expect(endOfDay(instant, AMMAN).toISOString()).toBe(
        '2026-08-30T20:59:59.999Z',
      );
    });

    it('keeps late-evening UTC instants on the correct local day', () => {
      // 22:30 UTC is already the next day in Amman (01:30)
      const lateUtc = new Date('2026-08-30T22:30:00.000Z');

      expect(startOfDay(lateUtc, AMMAN).toISOString()).toBe(
        '2026-08-30T21:00:00.000Z',
      );
    });

    it('agrees with UTC when the zone is UTC', () => {
      const instant = new Date('2026-08-30T08:00:00.000Z');

      expect(startOfDay(instant, 'UTC').toISOString()).toBe(
        '2026-08-30T00:00:00.000Z',
      );
      expect(endOfDay(instant, 'UTC').toISOString()).toBe(
        '2026-08-30T23:59:59.999Z',
      );
    });

    it('handles a zone with a half-hour offset', () => {
      const instant = new Date('2026-08-30T08:00:00.000Z');

      // India is UTC+5:30, so local midnight is 18:30 UTC the day before
      expect(startOfDay(instant, 'Asia/Kolkata').toISOString()).toBe(
        '2026-08-29T18:30:00.000Z',
      );
    });

    it('stays correct across a daylight-saving change', () => {
      // Central European Summer Time (UTC+2) in July
      const summer = new Date('2026-07-15T12:00:00.000Z');
      // Central European Time (UTC+1) in January
      const winter = new Date('2026-01-15T12:00:00.000Z');

      expect(startOfDay(summer, 'Europe/Berlin').toISOString()).toBe(
        '2026-07-14T22:00:00.000Z',
      );
      expect(startOfDay(winter, 'Europe/Berlin').toISOString()).toBe(
        '2026-01-14T23:00:00.000Z',
      );
    });
  });

  describe('resolveDateRange', () => {
    const now = new Date('2026-08-30T08:00:00.000Z');

    it('defaults to today when neither bound is given (BE-02)', () => {
      const range = resolveDateRange(undefined, undefined, AMMAN, now);

      expect(range.start.toISOString()).toBe('2026-08-29T21:00:00.000Z');
      expect(range.end.toISOString()).toBe('2026-08-30T20:59:59.999Z');
    });

    it('treats a lone `from` as that single day', () => {
      const range = resolveDateRange('2026-08-01', undefined, AMMAN, now);

      expect(range.start.toISOString()).toBe('2026-07-31T21:00:00.000Z');
      expect(range.end.toISOString()).toBe('2026-08-01T20:59:59.999Z');
    });

    it('covers whole days at both ends of a multi-day range', () => {
      const range = resolveDateRange('2026-08-01', '2026-08-31', AMMAN, now);

      expect(range.start.toISOString()).toBe('2026-07-31T21:00:00.000Z');
      expect(range.end.toISOString()).toBe('2026-08-31T20:59:59.999Z');
    });
  });

  describe('monthRange and currentMonth', () => {
    it('spans the whole calendar month in the agency timezone', () => {
      const range = monthRange(2026, 8, AMMAN);

      expect(range.start.toISOString()).toBe('2026-07-31T21:00:00.000Z');
      expect(range.end.toISOString()).toBe('2026-08-31T20:59:59.999Z');
    });

    it('rolls December over into the next year', () => {
      const range = monthRange(2026, 12, 'UTC');

      expect(range.start.toISOString()).toBe('2026-12-01T00:00:00.000Z');
      expect(range.end.toISOString()).toBe('2026-12-31T23:59:59.999Z');
    });

    it('reads the month from the local date, not the UTC date', () => {
      // 31 Aug 22:00 UTC is already 1 September in Amman
      const instant = new Date('2026-08-31T22:00:00.000Z');

      expect(currentMonth(instant, AMMAN)).toEqual({ month: 9, year: 2026 });
      expect(currentMonth(instant, 'UTC')).toEqual({ month: 8, year: 2026 });
    });
  });

  describe('elapsed-time helpers', () => {
    const now = new Date('2026-08-30T12:00:00.000Z');

    it('counts whole hours and minutes since an instant', () => {
      expect(hoursSince(new Date('2026-08-28T10:00:00.000Z'), now)).toBe(50);
      expect(minutesSince(new Date('2026-08-30T10:30:00.000Z'), now)).toBe(90);
    });

    it('counts whole days a due date is past', () => {
      expect(daysOverdue(new Date('2026-08-26T12:00:00.000Z'), now)).toBe(4);
      expect(daysOverdue(new Date('2026-08-30T00:00:00.000Z'), now)).toBe(0);
    });

    it('never reports negative age for a future date', () => {
      const future = new Date('2026-09-30T12:00:00.000Z');

      expect(hoursSince(future, now)).toBe(0);
      expect(minutesSince(future, now)).toBe(0);
      expect(daysOverdue(future, now)).toBe(0);
    });
  });
});
