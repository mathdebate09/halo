import { and, desc, inArray, isNull } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { router, useIsFocused } from 'expo-router';
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOutDown,
  LayoutAnimationConfig,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DOCK_HEIGHT } from '@/components/dock';
import { CloseIcon, ReportIcon } from '@/components/icons';
import { PressScale } from '@/components/press-scale';
import { setToastLift } from '@/components/toast';
import { db } from '@/db/client';
import { reports } from '@/db/schema';
import type { MergedReport } from '@/shared';
import { useHaloTheme } from '@/theme/theme-provider';

import { CARD_STATUSES, dismissReport, type ReportError, RETRYABLE, retryReport } from './runner';

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const CARD_HEIGHT = 62;

const ERROR_LINES: Record<ReportError, string> = {
  no_results: 'No test results on it',
  daily_limit: 'That’s enough pages for today. Try again tomorrow.',
  unavailable: 'Try again in a while',
  locked: 'Add it again to enter the password',
  source_lost: 'Add it again',
  error: 'Try again',
};

const pages = (n: number) => `${n} page${n === 1 ? '' : 's'}`;

/**
 * A report between pick and confirm, as one slim card above the dock on Vitals: pages read so far
 * with a thin line, then "Ready to check" (the confirm step opens from here, 20e), or why it
 * couldn't be read with Retry when trying later can work.
 */
export function ReportCard() {
  const insets = useSafeAreaInsets();
  const { theme } = useHaloTheme();
  const focused = useIsFocused();
  const { data } = useLiveQuery(
    db
      .select({
        id: reports.id,
        status: reports.status,
        progress: reports.progress,
        extracted: reports.extracted,
        error: reports.error,
      })
      .from(reports)
      .where(and(inArray(reports.status, [...CARD_STATUSES]), isNull(reports.deletedAt)))
      .orderBy(desc(reports.createdAt)),
  );

  // The ones waiting on the user first.
  const first =
    data.find((r) => r.status === 'review') ?? data.find((r) => r.status === 'failed') ?? data[0];
  const visible = !!first;
  useEffect(() => {
    setToastLift('report-card', visible && focused ? CARD_HEIGHT + 8 : 0);
    return () => setToastLift('report-card', 0);
  }, [visible, focused]);
  if (!first) return null;

  const more = data.length - 1;
  const progress = first.progress ?? { done: 0, total: 0 };
  const values = (first.extracted as MergedReport | null)?.values.length ?? 0;
  const error = (first.error ?? 'error') as ReportError;
  const title =
    first.status === 'analysing'
      ? 'Reading your report'
      : first.status === 'review'
        ? 'Ready to check'
        : 'Couldn’t read this report';
  const line =
    first.status === 'analysing'
      ? progress.done === 0
        ? pages(progress.total)
        : `${progress.done} of ${pages(progress.total)}`
      : first.status === 'review'
        ? `${values} value${values === 1 ? '' : 's'}${progress.capped ? ', from the first 12 pages' : ''}`
        : ERROR_LINES[error];
  const retryable = first.status === 'failed' && RETRYABLE.includes(error);

  return (
    <Animated.View
      entering={FadeInDown.duration(500).easing(EASE_OUT)}
      exiting={FadeOutDown.duration(300)}
      style={{
        position: 'absolute',
        left: 16,
        right: 16,
        bottom: insets.bottom + 12 + DOCK_HEIGHT + 12,
      }}>
      <View className="flex-row items-center rounded-pill border border-hairline/10 bg-surface p-2 pr-3">
        {/* A report ready to check opens the confirm step; the actions stay their own buttons. */}
        <PressScale
          accessibilityRole={first.status === 'review' ? 'button' : 'text'}
          accessibilityLabel={`${title}. ${line}${more > 0 ? `, and ${more} more` : ''}`}
          disabled={first.status !== 'review'}
          onPress={() => router.push({ pathname: '/report/[id]', params: { id: first.id } })}
          pressableStyle={{ flex: 1 }}
          className="flex-row items-center">
          <View className="h-11 w-11 items-center justify-center rounded-full bg-glass/10">
            <ReportIcon size={20} color={theme.colors.text} />
          </View>
          <View className="ml-3 flex-1">
            <LayoutAnimationConfig skipEntering>
              <Animated.View key={`${first.id}-${first.status}`} entering={FadeIn.duration(400)}>
                <Text numberOfLines={1} className="font-sans-medium text-[15px] text-text">
                  {title}
                </Text>
                <Text numberOfLines={1} className="font-sans text-[13px] text-muted">
                  {line}
                </Text>
              </Animated.View>
            </LayoutAnimationConfig>
            {first.status === 'analysing' ? (
              <ProgressLine
                fraction={progress.total ? progress.done / progress.total : 0}
                color={theme.colors.accent}
              />
            ) : null}
          </View>
          {more > 0 ? (
            <Text className="mr-2 font-sans-medium text-[13px] text-muted">+{more}</Text>
          ) : null}
        </PressScale>
        {/* The actions change with the state, so they cross in with the words. */}
        <LayoutAnimationConfig skipEntering>
          <Animated.View
            key={`${first.id}-${first.status}-actions`}
            entering={FadeIn.duration(400)}
            className="flex-row items-center">
            {retryable ? (
              <PressScale
                accessibilityRole="button"
                onPress={() => retryReport(first.id)}
                hitSlop={8}
                className="mr-1 rounded-pill bg-glass/10 px-3 py-1.5">
                <Text className="font-sans-medium text-[13px] text-text">Retry</Text>
              </PressScale>
            ) : null}
            {first.status !== 'analysing' ? (
              <PressScale
                accessibilityRole="button"
                accessibilityLabel={first.status === 'review' ? 'Discard this report' : 'Dismiss'}
                onPress={() => dismissReport(first.id)}
                hitSlop={10}
                className="h-9 w-9 items-center justify-center">
                <CloseIcon size={18} color={theme.colors.muted} />
              </PressScale>
            ) : null}
          </Animated.View>
        </LayoutAnimationConfig>
      </View>
    </Animated.View>
  );
}

/** Pages read so far, as a hairline that grows from the left (jumps under reduced motion). */
function ProgressLine({ fraction, color }: { fraction: number; color: string }) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(fraction);
  useEffect(() => {
    scale.set(reduced ? fraction : withTiming(fraction, { duration: 700, easing: EASE_OUT }));
  }, [fraction, reduced, scale]);
  // A sliver shows from the start, so the line reads as progress before the first page lands.
  const style = useAnimatedStyle(() => ({ transform: [{ scaleX: Math.max(0.04, scale.get()) }] }));
  return (
    <View className="mt-1.5 h-[2px] overflow-hidden rounded-pill bg-glass/10">
      <Animated.View
        style={[{ height: 2, backgroundColor: color, transformOrigin: 'left' }, style]}
      />
    </View>
  );
}
