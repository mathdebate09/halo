import * as Haptics from 'expo-haptics';
import { Pressable, Text, View } from 'react-native';

import { useHaloTheme } from '@/theme/theme-provider';
import { withAlpha } from '@/theme/themes';

export type DaySteps = { day: string; label: string; steps: number | null; today: boolean };

const HEIGHT = 64;

/**
 * The last seven days of steps against the goal line, and the page's day picker: tapping a day
 * shows that day everywhere on Exercise. The selected day is in the accent colour; days without
 * data (phone not carried) are a faint stub, not a zero.
 */
export function WeekBars({
  days,
  goal,
  selected,
  onSelect,
}: {
  days: DaySteps[];
  goal: number;
  selected: string;
  onSelect: (day: string) => void;
}) {
  const { theme } = useHaloTheme();
  const top = Math.max(goal, ...days.map((d) => d.steps ?? 0)) * 1.08 || 1;
  const goalY = HEIGHT * (1 - goal / top);

  return (
    <View>
      {/* The goal, as a dashed hairline behind the bars. */}
      <View
        pointerEvents="none"
        className="absolute inset-x-0 border-t border-dashed"
        style={{ top: goalY, borderColor: withAlpha(theme.colors.text, 0.25) }}
      />
      <View className="flex-row">
        {days.map((d) => {
          const active = d.day === selected;
          return (
            <Pressable
              key={d.day}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${d.label}, ${d.steps == null ? 'no data' : `${d.steps.toLocaleString('en-GB')} steps`}`}
              onPress={() => {
                if (active) return;
                Haptics.selectionAsync();
                onSelect(d.day);
              }}
              hitSlop={4}
              className="flex-1 items-center">
              <View style={{ height: HEIGHT }} className="w-full items-center justify-end">
                <View
                  className="w-[56%] rounded-full"
                  style={{
                    height: d.steps ? Math.max(4, (HEIGHT * d.steps) / top) : 4,
                    backgroundColor: active
                      ? theme.colors.accent
                      : withAlpha(theme.colors.text, d.steps ? 0.3 : 0.1),
                  }}
                />
              </View>
              <Text
                className={`mt-2 font-sans text-[13px] ${active ? 'font-sans-medium text-text' : 'text-muted'}`}>
                {d.label}
              </Text>
              {/* Today, marked even when another day is selected. */}
              <View
                className="mt-1 h-1 w-1 rounded-full"
                style={{ backgroundColor: d.today ? theme.colors.muted : 'transparent' }}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
