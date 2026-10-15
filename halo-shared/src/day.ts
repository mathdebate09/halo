// The app's "day" rolls over at 4 am local time, so a late snack still counts for today.

export const ROLLOVER_HOUR = 4;

const pad = (n: number) => String(n).padStart(2, '0');

/** Local day key 'YYYY-MM-DD' for a moment, honouring the 4 am rollover. */
export function dayKey(date: Date, rolloverHour = ROLLOVER_HOUR): string {
  const shifted = new Date(date.getTime());
  if (shifted.getHours() < rolloverHour) shifted.setDate(shifted.getDate() - 1);
  return `${shifted.getFullYear()}-${pad(shifted.getMonth() + 1)}-${pad(shifted.getDate())}`;
}

/** Local Date at which a day key starts (its rollover hour). */
export function dayStart(key: string, rolloverHour = ROLLOVER_HOUR): Date {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d, rolloverHour, 0, 0, 0);
}

/** Adds whole days to a day key. */
export function addDays(key: string, days: number): string {
  const start = dayStart(key, 12); // midday avoids DST edges
  start.setDate(start.getDate() + days);
  return `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
}

/**
 * The hour within the app's day: wall-clock hours, carried past midnight until the 4 am rollover
 * (00:30 → 24.5), so pace and meal windows don't restart at midnight.
 */
export function dayHour(date: Date, rolloverHour = ROLLOVER_HOUR): number {
  const h = hourOfDay(date);
  return h < rolloverHour ? h + 24 : h;
}

/** Wall-clock hour as a fraction (13:30 → 13.5). */
export const hourOfDay = (date: Date) =>
  date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;

/**
 * A clock time the way the device shows it: "17:00" / "22:30" on a 24-hour clock, otherwise
 * "5 pm" / "10:30 pm" (minutes only when there are some).
 */
export function formatClock(hour: number, h24 = true): string {
  const total = ((Math.round(hour * 60) % 1440) + 1440) % 1440;
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h24) return `${pad(h)}:${pad(m)}`;
  const suffix = h < 12 ? 'am' : 'pm';
  return `${h % 12 || 12}${m ? `:${pad(m)}` : ''} ${suffix}`;
}
