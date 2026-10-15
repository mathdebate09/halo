import { useState } from 'react';
import { Text, View } from 'react-native';

import { PressScale } from '@/components/press-scale';
import { dayStart, type VitalRow } from '@/shared';
import { useHaloTheme } from '@/theme/theme-provider';

import {
  compareText,
  displayNumber,
  displayValue,
  METRIC_LABELS,
  rowColor,
  shownBand,
  sourceText,
} from './metrics';
import { RangeSlider } from './range-slider';

const SLIDER_WIDTH = 140;

/** "Health Connect", or "Health Connect · Tue" for a reading from an earlier day. */
function sourceLine(row: VitalRow, today: string): string {
  const source = sourceText(row);
  // Last night's screen use is named in its label; other readings say which day they're from.
  if (!row.day || row.day === today || row.key === 'screen_late') return source;
  const weekday = dayStart(row.day, 12).toLocaleDateString('en-GB', { weekday: 'short' });
  return `${source} · ${weekday}`;
}

/**
 * One reading: its name and where it came from, the figure with a slider against its usual band,
 * and one line saying in words how it compares ("Shorter than your usual 9.4–10.5 h"), tinted
 * by whether that's good.
 */
export function MetricRow({
  row,
  today,
  pounds,
}: {
  row: VitalRow;
  today: string;
  pounds: boolean;
}) {
  const { theme } = useHaloTheme();
  const tint = rowColor(theme.colors, row.state);
  const { figure, unit } = displayValue(row, pounds);
  const compare = compareText(row, pounds);
  const band = shownBand(row);
  return (
    <View className="rounded-[24px] bg-glass/5 px-5 py-4">
      <View className="flex-row items-start justify-between">
        <Text className="flex-1 pr-3 font-sans text-[16px] text-text">
          {METRIC_LABELS[row.key]}
        </Text>
        <Text className="font-sans text-[13px] text-muted">{sourceLine(row, today)}</Text>
      </View>
      <View className="mt-2 flex-row items-center justify-between">
        <Text className="font-serif text-[40px] leading-[47px] text-text">
          {figure}
          {unit ? <Text className="font-sans text-[15px] text-muted">{` ${unit}`}</Text> : null}
        </Text>
        {band ? (
          <RangeSlider
            value={displayNumber(row.key, row.value, pounds)}
            lo={displayNumber(row.key, band.lo, pounds)}
            hi={displayNumber(row.key, band.hi, pounds)}
            tint={tint}
            width={SLIDER_WIDTH}
          />
        ) : null}
      </View>
      {compare ? (
        <Text className="mt-1 font-sans text-[14px]" style={{ color: tint }}>
          {compare}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * An area Halo can't read yet. Without Health Connect it offers to connect (the one thing that
 * can fill it); with it connected but nothing writing these readings, it just says so. Screen
 * time needs Usage access instead.
 */
export function EmptyRow({
  kind,
  onPress,
}: {
  kind: 'connect' | 'no_data' | 'usage_access';
  onPress?: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  if (kind === 'no_data') {
    return (
      <View className="rounded-[24px] bg-glass/5 px-5 py-4">
        <Text className="font-sans text-[16px] text-muted">No data</Text>
      </View>
    );
  }
  return (
    <View className="flex-row items-center rounded-[24px] bg-glass/5 px-5 py-4">
      <Text className="flex-1 pr-3 font-sans text-[16px] text-text">
        {kind === 'connect' ? 'Health Connect' : 'Phone usage'}
      </Text>
      <PressScale
        accessibilityRole="button"
        disabled={busy}
        onPress={async () => {
          setBusy(true);
          try {
            await onPress?.();
          } finally {
            setBusy(false);
          }
        }}
        className="rounded-pill bg-glass/10 px-4 py-2">
        <Text className="font-sans-medium text-[14px] text-text">
          {kind === 'connect' ? 'Connect' : 'Allow'}
        </Text>
      </PressScale>
    </View>
  );
}
