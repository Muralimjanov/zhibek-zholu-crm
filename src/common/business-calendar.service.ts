import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';

/** A calendar date "YYYY-MM-DD" in BUSINESS_TIMEZONE. */
export type IsoDate = string;

export const ISO_DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Business dates (shifts, day-offs, reports, accounting) are calendar days
 * in BUSINESS_TIMEZONE (default Asia/Bishkek), not UTC days - otherwise a
 * shift opened at 02:00 local time would land on the previous day.
 *
 * Working days are configurable (WORKING_WEEKDAYS). OPEN QUESTION: the TZ
 * does not define the working week or public holidays.
 */
@Injectable()
export class BusinessCalendar {
  constructor(private readonly config: AppConfigService) {}

  today(now: Date = new Date()): IsoDate {
    return this.dateOf(now);
  }

  dateOf(instant: Date): IsoDate {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: this.config.businessTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(instant);
    const get = (type: string) => parts.find((p) => p.type === type)!.value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  }

  isWorkingDay(date: IsoDate): boolean {
    const jsDay = toDbDate(date).getUTCDay(); // 0 = Sunday
    const isoDay = jsDay === 0 ? 7 : jsDay;
    return this.config.workingWeekdays.includes(isoDay);
  }

  addDays(date: IsoDate, days: number): IsoDate {
    const d = toDbDate(date);
    d.setUTCDate(d.getUTCDate() + days);
    return fromDbDate(d);
  }

  /** [start, end) instants of a business day, for filtering timestamp columns. */
  dayBounds(date: IsoDate): { start: Date; endExclusive: Date } {
    return { start: this.startOfDay(date), endExclusive: this.startOfDay(this.addDays(date, 1)) };
  }

  /** UTC instant of local midnight in BUSINESS_TIMEZONE (DST-safe via two passes). */
  private startOfDay(date: IsoDate): Date {
    const midnightUtc = toDbDate(date).getTime();
    let guess = midnightUtc;
    for (let i = 0; i < 2; i++) {
      guess = midnightUtc - this.offsetMs(new Date(guess));
    }
    return new Date(guess);
  }

  private offsetMs(instant: Date): number {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: this.config.businessTimezone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(instant);
    const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
    return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
  }

  /** Working days strictly before `date`, most recent first, within `lookbackDays` calendar days. */
  pastWorkingDays(date: IsoDate, lookbackDays: number): IsoDate[] {
    const out: IsoDate[] = [];
    for (let i = 1; i <= lookbackDays; i++) {
      const d = this.addDays(date, -i);
      if (this.isWorkingDay(d)) out.push(d);
    }
    return out;
  }
}

/** "YYYY-MM-DD" -> Date at UTC midnight (the value Prisma uses for @db.Date). */
export function toDbDate(date: IsoDate): Date {
  if (!ISO_DATE_PATTERN.test(date)) throw new Error(`Invalid date: ${date}`);
  const d = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || fromDbDate(d) !== date) throw new Error(`Invalid date: ${date}`);
  return d;
}

export function fromDbDate(d: Date): IsoDate {
  return d.toISOString().slice(0, 10);
}

/** "YYYY-MM" -> [first day, first day of next month) as DB dates. */
export function periodRange(period: string): { start: Date; endExclusive: Date } {
  if (!PERIOD_PATTERN.test(period)) throw new Error(`Invalid period: ${period}`);
  const [y, m] = period.split('-').map(Number);
  return {
    start: new Date(Date.UTC(y, m - 1, 1)),
    endExclusive: new Date(Date.UTC(y, m, 1)),
  };
}

export function periodOf(date: IsoDate): string {
  return date.slice(0, 7);
}
