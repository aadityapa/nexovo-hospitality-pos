import { format, formatDistanceToNowStrict, startOfDay, endOfDay, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, differenceInSeconds } from 'date-fns';
import type { DateRange, DashboardPreset } from '@/types';

export const nowIso = (): string => new Date().toISOString();

export function fmtTime(iso?: string | null): string {
  return iso ? format(new Date(iso), 'hh:mm a') : '—';
}
export function fmtDate(iso?: string | null): string {
  return iso ? format(new Date(iso), 'dd MMM yyyy') : '—';
}
export function fmtDateTime(iso?: string | null): string {
  return iso ? format(new Date(iso), 'dd MMM yyyy, hh:mm a') : '—';
}
export function fmtRelative(iso?: string | null): string {
  return iso ? formatDistanceToNowStrict(new Date(iso), { addSuffix: true }) : '—';
}

/** "05:30" elapsed since ISO */
export function elapsedClock(iso: string, now: Date = new Date()): string {
  const secs = Math.max(0, differenceInSeconds(now, new Date(iso)));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
export function elapsedMinutes(iso: string, now: Date = new Date()): number {
  return Math.floor(Math.max(0, differenceInSeconds(now, new Date(iso))) / 60);
}

export function rangeForPreset(preset: DashboardPreset, custom?: { from: string; to: string }): DateRange {
  const now = new Date();
  switch (preset) {
    case 'today': return { from: startOfDay(now).toISOString(), to: endOfDay(now).toISOString() };
    case 'yesterday': { const y = subDays(now, 1); return { from: startOfDay(y).toISOString(), to: endOfDay(y).toISOString() }; }
    case 'week': return { from: startOfWeek(now, { weekStartsOn: 1 }).toISOString(), to: endOfWeek(now, { weekStartsOn: 1 }).toISOString() };
    case 'month': return { from: startOfMonth(now).toISOString(), to: endOfMonth(now).toISOString() };
    case 'custom': {
      const from = custom?.from ? startOfDay(new Date(custom.from)) : startOfDay(now);
      const to = custom?.to ? endOfDay(new Date(custom.to)) : endOfDay(now);
      return { from: from.toISOString(), to: to.toISOString() };
    }
  }
}

export const toDateInput = (d: Date): string => format(d, 'yyyy-MM-dd');
export const todayInput = (): string => toDateInput(new Date());
