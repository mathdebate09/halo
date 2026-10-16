import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { ChevronRightIcon, ReportIcon } from '@/components/icons';
import { PressScale } from '@/components/press-scale';
import { type Area, type Factor, formatLabNumber } from '@/shared';
import { useHaloTheme } from '@/theme/theme-provider';
import { AreaCard } from '@/vitals/area-card';
import { RangeSlider } from '@/vitals/range-slider';

import { addReport } from './add';
import { shortDate, useLabResults } from './lab-data';

const SLIDER_WIDTH = 140;

/**
 * Blood work in the Vitals detail. With a report that still counts, it's an area like the others
 * (state and one sentence, then All results); under it only the factors people know (cholesterol,
 * blood sugar, haemoglobin, vitamin D, B12, thyroid), each with its value against the expected
 * range and one way to improve it when it needs care. Without a report, one row to add one.
 */
export function BloodWorkSection({ area, summary }: { area?: Area; summary: string }) {
  const { theme } = useHaloTheme();
  const { results, factors } = useLabResults();
  const allResults = () => router.push('/reports');

  return (
    <View className="mt-6 gap-2">
      {area ? (
        <AreaCard
          area={area}
          summary={summary}
          action={{ label: 'All results', onPress: allResults }}
        />
      ) : (
        <View className="flex-row items-center px-1 pb-1">
          <ReportIcon size={20} color={theme.colors.muted} />
          <Text className="ml-2 flex-1 font-sans text-[18px] text-text">Blood work</Text>
          {results.length > 0 ? (
            <PressScale
              accessibilityRole="button"
              onPress={allResults}
              hitSlop={8}
              className="flex-row items-center">
              <Text className="font-sans-medium text-[14px] text-muted">All results</Text>
              <ChevronRightIcon size={16} color={theme.colors.muted} />
            </PressScale>
          ) : null}
        </View>
      )}
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
    </View>
  );
}

/**
 * One familiar factor: the value, a slider with the expected range at its ends, a short state and
 * the previous report's value, and the step when it needs care. No sentences.
 */
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
  // An upper limit alone starts the band at 0; a lower one alone has no band to draw, so its
  // expected value is written instead ("over 40").
  const range = lead.range;
  const band = range?.hi != null ? { lo: range.lo ?? 0, hi: range.hi } : null;

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
            labels={{
              lo: range?.lo != null ? formatLabNumber(range.lo) : undefined,
              hi: range?.lo != null ? formatLabNumber(band.hi) : `< ${formatLabNumber(band.hi)}`,
            }}
          />
        ) : lead.expected ? (
          <Text className="font-sans text-[14px] text-muted">{lead.expected}</Text>
        ) : null}
      </View>
      {lead.stateWord || lead.trend ? (
        <Text className="mt-1 font-sans text-[14px] text-muted">
          {lead.stateWord ? <Text style={{ color: tint }}>{lead.stateWord}</Text> : null}
          {lead.stateWord && lead.trend ? ' · ' : ''}
          {lead.trend}
        </Text>
      ) : null}
      {advice ? (
        <Text className="mt-2 font-sans text-[15px] leading-[22px] text-text/85">{advice}</Text>
      ) : null}
    </View>
  );
}
