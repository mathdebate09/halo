import { router } from 'expo-router';
import { Text, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, FadeIn } from 'react-native-reanimated';

import { PlusIcon, SparkleIcon, VitalsIcon } from '@/components/icons';
import { PressScale } from '@/components/press-scale';
import { addReport } from '@/reports/add';
import { vitalsHeadline } from '@/shared';
import { useHaloTheme } from '@/theme/theme-provider';
import { useTodayScores } from '@/today/today-scores';

import { useHeldBands } from './areas';
import { Bands } from './bands';

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

/**
 * The first thing Vitals says, one screen tall like Today's hero: three areas on their bands
 * (whichever have the most to say today), one headline and one prepared step, then Advisor (opens
 * its own screen) and Vitals (scrolls to the detail below the fold).
 */
export function VitalsHero({
  top,
  bottom,
  height,
  onDetail,
}: {
  top: number;
  bottom: number;
  height: number;
  onDetail: () => void;
}) {
  const { theme } = useHaloTheme();
  const { width } = useWindowDimensions();
  const scores = useTodayScores();
  const report = scores.vitalsReport;
  const shown = useHeldBands(scores.day, report.areas);
  const words = vitalsHeadline(shown);

  return (
    <View style={{ minHeight: height }}>
      <View className="flex-row items-center px-5" style={{ paddingTop: top + 12 }}>
        <VitalsIcon size={26} color={theme.colors.text} />
        <Text accessibilityRole="header" className="ml-2.5 font-serif text-[30px] text-text">
          Vitals
        </Text>
        <View className="flex-1" />
        <PressScale
          accessibilityRole="button"
          accessibilityLabel="Add a medical report"
          onPress={() => void addReport()}
          hitSlop={8}
          className="h-11 w-11 items-center justify-center rounded-full bg-glass/10">
          <PlusIcon size={22} color={theme.colors.text} />
        </PressScale>
      </View>

      <View className="-mt-4">
        <Bands areas={shown} width={width} height={Math.round(height * 0.38)} />
        {/* Close under the ribbons, as in Oura. */}
        <View className="mt-2 flex-row justify-between px-5">
          <Text
            className="font-sans-medium text-[13px] tracking-[1.5px]"
            style={{ color: theme.colors.opportunity }}>
            NEEDS CARE
          </Text>
          <Text
            className="font-sans-medium text-[13px] tracking-[1.5px]"
            style={{ color: theme.colors.strength }}>
            THRIVING
          </Text>
        </View>
      </View>

      <View className="flex-1" />

      <Animated.View
        entering={FadeIn.duration(700).delay(500).easing(EASE_OUT)}
        className="mt-10 px-5"
        style={{ paddingBottom: bottom + 24 }}>
        <Text className="font-sans-medium text-[13px] tracking-[1px] text-muted">
          {`VITALS ${report.score.value}${report.score.dataBacked ? '' : ' · EARLY READ'}`}
        </Text>
        <Text className="mt-2 font-serif text-[40px] leading-[47px] text-text">
          {words.headline}
        </Text>
        <Text className="mt-2 font-sans text-[16px] leading-[24px] text-text/85">{words.line}</Text>
        <View className="mt-7 flex-row justify-center gap-3">
          <PressScale
            accessibilityRole="button"
            accessibilityHint="Opens the Advisor"
            onPress={() => router.push({ pathname: '/advisor', params: { from: 'vitals' } })}
            className="flex-row items-center rounded-pill bg-text px-6 py-3.5">
            <SparkleIcon size={18} color={theme.colors.bg} />
            <Text className="ml-2 font-sans-medium text-[16px] text-bg">Advisor</Text>
          </PressScale>
          <PressScale
            accessibilityRole="button"
            accessibilityHint="Scrolls to every reading"
            onPress={onDetail}
            className="rounded-pill bg-glass/10 px-8 py-3.5">
            <Text className="font-sans-medium text-[16px] text-text">Vitals</Text>
          </PressScale>
        </View>
      </Animated.View>
    </View>
  );
}
