import { useEffect, useState } from 'react';

export type TimeOfDay = 'day' | 'dusk' | 'night';

export function timeOfDay(date = new Date()): TimeOfDay {
  const h = date.getHours();
  if (h >= 5 && h < 17) return 'day';
  if (h >= 17 && h < 20) return 'dusk';
  return 'night';
}

/** Current part of the day, re-checked every minute (drives the Today tab icon). */
export function useTimeOfDay() {
  const [value, setValue] = useState(timeOfDay);
  useEffect(() => {
    const id = setInterval(() => setValue(timeOfDay()), 60_000);
    return () => clearInterval(id);
  }, []);
  return value;
}
