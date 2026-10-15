import { addDays, dayStart } from '@/shared';

/** "Today", "Yesterday", or a short date ("Mon 12 Oct") for a day key. */
export function dayLabel(day: string, today: string) {
  if (day === today) return 'Today';
  if (day === addDays(today, -1)) return 'Yesterday';
  return dayStart(day, 12).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}
