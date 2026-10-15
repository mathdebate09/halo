import { Text, View } from 'react-native';

import { useHaloTheme } from '@/theme/theme-provider';
import { withAlpha } from '@/theme/themes';

const HEIGHT = 72;

/**
 * A day hour by hour (24 bars from midnight) with guides every six hours, in one colour.
 * `values` is null while the hours are being read: the guides show, the bars don't.
 */
export function HourlyBars({
  values,
  color,
  labels,
}: {
  values: number[] | null;
  color: string;
  /** Captions for 00, 06, 12 and 18 in the device's clock format. */
  labels: [string, string, string, string];
}) {
  const { theme } = useHaloTheme();
  const max = values ? Math.max(...values) : 0;
  const guide = withAlpha(theme.colors.text, 0.12);

  return (
    <View>
      <View style={{ height: HEIGHT }} className="flex-row items-end">
        {Array.from({ length: 24 }, (_, h) => {
          const v = values?.[h] ?? 0;
          return (
            <View key={h} className="h-full flex-1 items-center justify-end">
              {/* Six-hour guides, like a clock face laid flat. */}
              {h % 6 === 0 ? (
                <View
                  className="absolute bottom-0 left-0 top-0 w-px"
                  style={{ backgroundColor: guide }}
                />
              ) : null}
              {v > 0 && max > 0 ? (
                <View
                  className="w-[46%] rounded-full"
                  style={{ height: Math.max(3, (HEIGHT * v) / max), backgroundColor: color }}
                />
              ) : null}
            </View>
          );
        })}
      </View>
      <View className="mt-1.5 flex-row">
        {labels.map((label) => (
          <Text key={label} className="flex-1 font-sans text-[11px] text-muted">
            {label}
          </Text>
        ))}
      </View>
    </View>
  );
}
