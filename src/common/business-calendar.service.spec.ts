import { AppConfigService } from '../config/app-config.service';
import { BusinessCalendar, periodRange, toDbDate } from './business-calendar.service';

function calendar(timezone = 'Asia/Bishkek', weekdays = [1, 2, 3, 4, 5]) {
  return new BusinessCalendar({ businessTimezone: timezone, workingWeekdays: weekdays } as unknown as AppConfigService);
}

describe('BusinessCalendar', () => {
  it('uses the business timezone, not UTC, for "today"', () => {
    // 2026-09-16 20:30 UTC is already 2026-09-17 02:30 in Bishkek (UTC+6).
    const instant = new Date('2026-09-16T20:30:00Z');
    expect(calendar().today(instant)).toBe('2026-09-17');
    expect(calendar('UTC').today(instant)).toBe('2026-09-16');
  });

  it('applies the configured working week', () => {
    const cal = calendar();
    expect(cal.isWorkingDay('2026-09-18')).toBe(true); // Friday
    expect(cal.isWorkingDay('2026-09-19')).toBe(false); // Saturday
    expect(calendar('Asia/Bishkek', [1, 2, 3, 4, 5, 6]).isWorkingDay('2026-09-19')).toBe(true);
  });

  it('lists past working days for catch-up, skipping weekends', () => {
    expect(calendar().pastWorkingDays('2026-09-21', 4)).toEqual(['2026-09-18', '2026-09-17']);
  });

  it('rejects impossible dates and periods', () => {
    expect(() => toDbDate('2026-02-30')).toThrow();
    expect(() => toDbDate('26-02-01')).toThrow();
    expect(() => periodRange('2026-13')).toThrow();
    expect(periodRange('2026-12').endExclusive.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
});

describe('BusinessCalendar.dayBounds', () => {
  it('maps a Bishkek business day (UTC+6) to the right UTC instants', () => {
    const { start, endExclusive } = calendar().dayBounds('2026-09-17');
    expect(start.toISOString()).toBe('2026-09-16T18:00:00.000Z');
    expect(endExclusive.toISOString()).toBe('2026-09-17T18:00:00.000Z');
  });

  it('handles DST zones (Europe/Berlin, day of the spring-forward change is 23h)', () => {
    const { start, endExclusive } = calendar('Europe/Berlin').dayBounds('2026-03-29');
    expect(start.toISOString()).toBe('2026-03-28T23:00:00.000Z');
    expect(endExclusive.toISOString()).toBe('2026-03-29T22:00:00.000Z');
  });
});
