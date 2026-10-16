import { View } from 'react-native';

import { WHEEL_ITEM_HEIGHT, WheelPicker } from './wheel-picker';

export type WheelDate = { year: number; month: number; day: number };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');
export const daysIn = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
/** "2026-10-16" for a wheel date (month is 0-based). */
export const wheelKey = (d: WheelDate) => `${d.year}-${pad(d.month + 1)}-${pad(d.day)}`;
export function wheelDate(key: string): WheelDate {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return { year: y, month: m - 1, day: d };
}

/**
 * Day / month / year wheels under one centre band. A shorter month (or a non-leap February)
 * clamps the day.
 */
export function DateWheels({
  value,
  onChange,
  years,
}: {
  value: WheelDate;
  onChange: (next: WheelDate) => void;
  years: readonly number[];
}) {
  const days = Array.from({ length: daysIn(value.year, value.month) }, (_, i) => String(i + 1));
  const update = (patch: Partial<WheelDate>) => {
    const next = { ...value, ...patch };
    onChange({ ...next, day: Math.min(next.day, daysIn(next.year, next.month)) });
  };
  return (
    <View className="flex-row">
      {/* The centre band marks the selected row across all three wheels. */}
      <View
        pointerEvents="none"
        style={{ top: WHEEL_ITEM_HEIGHT * 2, height: WHEEL_ITEM_HEIGHT }}
        className="absolute inset-x-0 rounded-2xl bg-glass/10"
      />
      <View className="flex-[0.8]">
        <WheelPicker
          accessibilityLabel="Day"
          items={days}
          selectedIndex={value.day - 1}
          onChange={(i) => update({ day: i + 1 })}
        />
      </View>
      <View className="flex-[1.2]">
        <WheelPicker
          accessibilityLabel="Month"
          items={MONTHS}
          selectedIndex={value.month}
          onChange={(i) => update({ month: i })}
        />
      </View>
      <View className="flex-1">
        <WheelPicker
          accessibilityLabel="Year"
          items={years.map(String)}
          selectedIndex={Math.max(0, years.indexOf(value.year))}
          onChange={(i) => update({ year: years[i]! })}
        />
      </View>
    </View>
  );
}
