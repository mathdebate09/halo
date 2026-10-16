import { Text, View } from 'react-native';

import { clamp } from '@/shared';
import { useHaloTheme } from '@/theme/theme-provider';
import { withAlpha } from '@/theme/themes';

const DOT = 14;
const LABEL_WIDTH = 48;

/**
 * Oura's vitals slider: a quiet track, the usual band brighter, and a dot at the value in the
 * state's tint. The words under the row name the band, so the slider carries no labels. Read-only.
 */
export function RangeSlider({
  value,
  lo,
  hi,
  tint,
  width,
  labels,
}: {
  value: number;
  lo: number;
  hi: number;
  tint: string;
  width: number;
  /** Numbers under the band's ends (the expected range), as in Oura's vitals. */
  labels?: { lo?: string; hi?: string };
}) {
  const { theme } = useHaloTheme();
  // The scale reaches a little past both the band and the value, so neither sits on the edge.
  const span = Math.max(hi - lo, Math.abs(hi) * 0.05, 1);
  const min = Math.min(lo, value) - span * 0.6;
  const max = Math.max(hi, value) + span * 0.6;
  const x = (v: number) => clamp((v - min) / (max - min), 0, 1) * width;
  const bandLeft = x(lo);
  const bandWidth = Math.max(2, x(hi) - bandLeft);

  const label = (text: string | undefined, at: number) =>
    text ? (
      <Text
        className="absolute font-sans text-[12px] text-muted"
        style={{
          top: DOT + 4,
          width: LABEL_WIDTH,
          textAlign: 'center',
          left: clamp(at - LABEL_WIDTH / 2, -LABEL_WIDTH / 4, width - (LABEL_WIDTH * 3) / 4),
        }}>
        {text}
      </Text>
    ) : null;

  return (
    <View style={{ width, height: labels ? DOT + 22 : DOT }}>
      <View style={{ height: DOT, justifyContent: 'center' }}>
        <View
          style={{
            height: 3,
            borderRadius: 2,
            backgroundColor: withAlpha(theme.colors.text, 0.18),
          }}
        />
        <View
          style={{
            position: 'absolute',
            left: bandLeft,
            width: bandWidth,
            height: 3,
            borderRadius: 2,
            backgroundColor: withAlpha(theme.colors.text, 0.75),
          }}
        />
        <View
          style={{
            position: 'absolute',
            left: x(value) - DOT / 2,
            width: DOT,
            height: DOT,
            borderRadius: DOT / 2,
            backgroundColor: tint,
            borderWidth: 3,
            borderColor: theme.colors.text,
          }}
        />
      </View>
      {label(labels?.lo, bandLeft)}
      {label(labels?.hi, bandLeft + bandWidth)}
    </View>
  );
}
