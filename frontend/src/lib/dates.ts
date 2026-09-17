import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';

const TZ = 'Asia/Bishkek';

/** Today as YYYY-MM-DD in the business time zone (matches the backend). */
export function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function currentPeriod(): string {
  return todayIso().slice(0, 7);
}

export function monthStartIso(): string {
  return `${currentPeriod()}-01`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return format(parseISO(iso.slice(0, 10)), 'd MMM yyyy', { locale: ru });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('ru-RU', { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('ru-RU', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

export function formatPeriod(period: string): string {
  return format(parseISO(`${period}-01`), 'LLLL yyyy', { locale: ru });
}
