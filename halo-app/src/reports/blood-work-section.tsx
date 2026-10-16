import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { ChevronRightIcon, ReportIcon } from '@/components/icons';
import { PressScale } from '@/components/press-scale';
import { type Factor, formatLabNumber } from '@/shared';
import { useHaloTheme } from '@/theme/theme-provider';
import { RangeSlider } from '@/vitals/range-slider';

import { addReport } from './add';
import { shortDate, useLabResults } from './lab-data';

const SLIDER_WIDTH = 140;

/**
 * Blood work in the Vitals detail: only the factors people know (cholesterol, blood sugar,
 * haemoglobin, vitamin D, B12, thyroid) that the reports cover, each with its leading value in
 * words and one way to improve it when it needs care; every result is a tap away. Without a report
 * yet, one row to add one.
 */
export function BloodWorkSection() {
  const { theme } = useHaloTheme();
  const { results, factors } = useLabResults();

  return (
    <View className="mt-6 gap-2">
      <View className="flex-row items-center px-1 pb-1">
        <ReportIcon size={20} color={theme.colors.muted} />
        <Text className="ml-2 flex-1 font-sans text-[18px] text-text">Blood work</Text>
        {results.length > 0 ? (
          <PressScale
            accessibilityRole="button"
            onPress={() => router.push('/reports')}
            hitSlop={8}
            className="flex-row items-center">
            <Text className="font-sans-medium text-[14px] text-muted">All results</Text>
            <ChevronRightIcon size={16} color={theme.colors.muted} />
          </PressScale>
        ) : null}
      </View>
      {results.length === 0 ? (
        <View className="flex-row items-center rounded-[24px] bg-glass/5 px-5 py-4">
          <Text className="flex-1 pr-3 font-sans text-[16px] text-text">A lab report</Text>
          <PressScale
            accessibilityRole="button"
            onPress={() => void addReport()}
            className="rounded-pill bg-glass/10 px-4 py-2">
            <Text className="font-sans-medium text-[14px] text-text">Add</Text>
          </PressScale>
        </View>
      ) : (
        factors.map((f) => <FactorRow key={f.key} factor={f} />)
      )}
      {results.length > 0 && factors.length === 0 ? (
        <PressScale
          accessibilityRole="button"
          onPress={() => router.push('/reports')}
          className="flex-row items-center rounded-[24px] bg-glass/5 px-5 py-4">
          <Text className="flex-1 font-sans text-[16px] text-text">
            {`${results.length} result${results.length === 1 ? '' : 's'} from your reports`}
          </Text>
          <ChevronRightIcon size={18} color={theme.colors.muted} />
        </PressScale>
      ) : null}
    </View>
  );
}

/** One familiar factor: its leading value against its range, the words, and the step. */
function FactorRow({ factor }: { factor: Factor }) {
  const { theme } = useHaloTheme();
  const { lead, advice } = factor;
  const outside = lead.state === 'above' || lead.state === 'below';
  const tint = outside
    ? theme.colors.opportunity
    : lead.state
      ? theme.colors.steady
      : theme.colors.muted;
  const source =
    lead.label === factor.label ? shortDate(lead.day) : `${lead.label} · ${shortDate(lead.day)}`;
  // A lower bound alone (HDL > 40) has nothing to draw a band to; an upper one starts at 0.
  const band = lead.range?.hi != null ? { lo: lead.range.lo ?? 0, hi: lead.range.hi } : null;

  return (
    <View className="rounded-[24px] bg-glass/5 px-5 py-4">
      <View className="flex-row items-start justify-between">
        <Text className="flex-1 pr-3 font-sans text-[16px] text-text">{factor.label}</Text>
        <Text className="font-sans text-[13px] text-muted">{source}</Text>
      </View>
      <View className="mt-2 flex-row items-center justify-between">
        <Text className="font-serif text-[40px] leading-[47px] text-text">
          {`${lead.qualifier ?? ''}${formatLabNumber(lead.value)}`}
          {lead.unit ? (
            <Text className="font-sans text-[15px] text-muted">{` ${lead.unit}`}</Text>
          ) : null}
        </Text>
        {band ? (
          <RangeSlider
            value={lead.value}
            lo={band.lo}
            hi={band.hi}
            tint={tint}
            width={SLIDER_WIDTH}
          />
        ) : null}
      </View>
      {lead.line ? (
        <Text className="mt-1 font-sans text-[14px]" style={{ color: tint }}>
          {lead.line}
        </Text>
      ) : null}
      {advice ? (
        <Text className="mt-2 font-sans text-[15px] leading-[22px] text-text/85">{advice}</Text>
      ) : null}
    </View>
  );
}
