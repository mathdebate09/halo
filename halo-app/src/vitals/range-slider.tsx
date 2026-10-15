import { View } from 'react-native';

import { clamp } from '@/shared';
import { useHaloTheme } from '@/theme/theme-provider';
import { withAlpha } from '@/theme/themes';

const DOT = 14;

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
}: {
  value: number;
  lo: number;
  hi: number;
  tint: string;
  width: number;
}) {
  const { theme } = useHaloTheme();
  // The scale reaches a little past both the band and the value, so neither sits on the edge.
  const span = Math.max(hi - lo, Math.abs(hi) * 0.05, 1);
  const min = Math.min(lo, value) - span * 0.6;
  const max = Math.max(hi, value) + span * 0.6;
  const x = (v: number) => clamp((v - min) / (max - min), 0, 1) * width;
  const bandLeft = x(lo);
  const bandWidth = Math.max(2, x(hi) - bandLeft);

  return (
    <View style={{ width, height: DOT, justifyContent: 'center' }}>
      <View
        style={{ height: 3, borderRadius: 2, backgroundColor: withAlpha(theme.colors.text, 0.18) }}
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
  );
}
