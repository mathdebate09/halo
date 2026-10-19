// Today's three score bubbles, each holding the PA's one step for its area (chunk 24b). Tapping a
// bubble glides it to the left edge, the other two step aside to the right, and the step slides in
// beside it in the same row. The same bubble, scrolling on, or leaving Today slides it all back.

import * as Haptics from 'expo-haptics';
import { useIsFocused } from 'expo-router';
import { type ComponentType, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  Extrapolation,
  FadeIn,
  interpolate,
  LayoutAnimationConfig,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { runAction } from '@/assistant/actions';
import { useAssistant } from '@/assistant/assistant';
import { recordShown } from '@/assistant/loop-store';
import { DietIcon, ExerciseIcon, VitalsIcon } from '@/components/icons';
import { PressScale } from '@/components/press-scale';
import { ScoreChip } from '@/components/score-chip';
import { useUnits } from '@/lib/units';
import { areaTip, type InsightCopy, type Tip, type TipArea, vitalsDetail } from '@/shared';
import { motion } from '@/theme/motion';
import type { TodayScores } from '@/today/today-scores';
import { compareText, displayValue } from '@/vitals/metrics';
import { areaSummary } from '@/vitals/summary';

const AREAS: {
  area: TipArea;
  label: string;
  Icon: ComponentType<{ size?: number; color: string }>;
}[] = [
  { area: 'diet', label: 'Diet', Icon: DietIcon },
  { area: 'activity', label: 'Activity', Icon: ExerciseIcon },
  { area: 'vitals', label: 'Vitals', Icon: VitalsIcon },
];
/** The row's side gutter, which the opened bubble glides to. */
const GUTTER = 20;
const CHIP = 76;
const OPEN_MS = 600;
const CLOSE_MS = 450;

type Props = {
  scores: TodayScores;
  /** Today's scroll offset: scrolling on toward Learn more closes the step. */
  scrollY: SharedValue<number>;
  closeAt: number;
  color: string;
  /** The brief's words on the hero (reworded when cached), so a tip that is the brief reads the same. */
  words: InsightCopy;
};

/** "6.6 h · Shorter than your usual 7–8 h": the focus area's first reading against its band. */
function vitalsFacts(tip: Tip, scores: TodayScores, pounds: boolean): string | null {
  if (!tip.focus) return null;
  const { rows } = vitalsDetail(scores.vitalsInput, scores.vitalsReport);
  const mine = rows.filter((r) => r.area === tip.focus);
  for (const row of mine) {
    const versus = compareText(row, pounds);
    if (!versus) continue;
    const { figure, unit } = displayValue(row, pounds);
    return `${unit ? `${figure} ${unit}` : figure} · ${versus}`;
  }
  const area = scores.vitalsReport.areas.find((a) => a.key === tip.focus);
  return area ? areaSummary(area, rows, scores.vitalsInput, pounds) : null;
}

export function TodayChips({ scores, scrollY, closeAt, color, words }: Props) {
  const { brief, context } = useAssistant();
  const [units] = useUnits();
  const reduced = useReducedMotion();
  const focused = useIsFocused();
  const [open, setOpenState] = useState<number | null>(null);
  // Read by close(), which also runs from the scroll reaction (a closure from an older render).
  const openRef = useRef<number | null>(null);
  const setOpen = (i: number | null) => {
    openRef.current = i;
    setOpenState(i);
  };
  const [xs, setXs] = useState<number[]>([]);
  const progress = useSharedValue(0);
  // Closing keeps `open` until the bubbles are home, so the step fades out with its words.
  const closing = useRef(false);

  const close = (instant = false) => {
    if (openRef.current == null || closing.current) return;
    if (instant) {
      progress.set(0);
      setOpen(null);
      return;
    }
    closing.current = true;
    progress.set(
      withTiming(0, { duration: CLOSE_MS, easing: motion.calm }, (done) => {
        if (done) scheduleOnRN(finishClose);
      }),
    );
  };
  const finishClose = () => {
    closing.current = false;
    setOpen(null);
  };
  const toggle = (i: number) => {
    if (open === i) return close();
    if (open != null) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setOpen(i);
    progress.set(withTiming(1, { duration: OPEN_MS, easing: motion.calm }));
  };

  // Leaving Today or scrolling on toward Learn more puts the bubbles back.
  useEffect(() => {
    if (!focused) close(true);
  }, [focused]);
  useAnimatedReaction(
    () => scrollY.get() > closeAt,
    (away, before) => {
      if (away && !before) scheduleOnRN(close);
    },
  );

  const tip = open == null ? null : areaTip(AREAS[open]!.area, context, brief, scores.vitalsReport);
  // A tip that is the brief on the hero says it in the hero's words.
  const line = tip && tip.briefId === brief.insight.id ? words.line : tip?.line;
  const facts =
    tip?.area === 'vitals' ? vitalsFacts(tip, scores, units.weight === 'lb') : (tip?.facts ?? null);
  const shownId = tip?.insight?.id;
  useEffect(() => {
    if (tip?.insight) recordShown(tip.insight, scores.day, 'today');
  }, [shownId]);

  // Where the step sits: right of the opened bubble, to the row's right gutter.
  const tipStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.get(), [0.35, 1], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateX: reduced ? 0 : interpolate(progress.get(), [0, 1], [24, 0]) }],
  }));

  const values = [scores.diet.value, scores.activity.value, scores.vitals.value];
  return (
    <View className="flex-row justify-center gap-5">
      {AREAS.map(({ area, label, Icon }, i) => (
        <ChipSlot
          key={area}
          index={i}
          open={open}
          progress={progress}
          reduced={reduced}
          dx={xs[i] != null ? GUTTER - xs[i]! : 0}
          onLayout={(x) =>
            setXs((prev) => (prev[i] === x ? prev : Object.assign([...prev], { [i]: x })))
          }>
          <PressScale
            accessibilityRole="button"
            accessibilityState={{ expanded: open === i }}
            accessibilityHint={open === i ? 'Hides the step' : 'Shows the step for this score'}
            disabled={open != null && open !== i}
            onPress={() => toggle(i)}>
            <ScoreChip label={label} value={values[i]!} Icon={Icon} color={color} />
          </PressScale>
        </ChipSlot>
      ))}

      {tip ? (
        <Animated.View
          pointerEvents="box-none"
          className="absolute top-0 justify-center"
          // Centred on the bubble; a taller step (with its button) grows down, away from the top bar.
          style={[{ left: GUTTER + CHIP + 16, right: GUTTER, minHeight: CHIP }, tipStyle]}>
          {/* A step that changes while open (a log lands, the hour turns) fades in, not swaps. */}
          <LayoutAnimationConfig skipEntering>
            <Animated.View
              key={`${line}|${facts}`}
              entering={FadeIn.duration(300).easing(motion.calm)}>
              <Text className="font-sans text-[16px] leading-[22px] text-text" numberOfLines={3}>
                {line}
              </Text>
              {facts ? (
                <Text
                  className="mt-1 font-sans text-[13px] leading-[18px] text-text/75"
                  numberOfLines={2}>
                  {facts}
                </Text>
              ) : null}
            </Animated.View>
          </LayoutAnimationConfig>
          {tip.action && tip.actionLabel ? (
            <PressScale
              accessibilityRole="button"
              onPress={() => {
                runAction(tip.action, tip.briefId);
                close();
              }}
              pressableStyle={{ alignSelf: 'flex-start' }}
              className="mt-3 rounded-pill bg-text px-4 py-2">
              <Text className="font-sans-medium text-[14px] text-bg">{tip.actionLabel}</Text>
            </PressScale>
          ) : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

type SlotProps = {
  index: number;
  open: number | null;
  progress: SharedValue<number>;
  reduced: boolean;
  /** How far the bubble glides to reach the left gutter. */
  dx: number;
  onLayout: (x: number) => void;
  children: React.ReactNode;
};

/** One bubble's motion: the opened one glides left; the others fade and step aside to the right. */
function ChipSlot({ index, open, progress, reduced, dx, onLayout, children }: SlotProps) {
  const style = useAnimatedStyle(() => {
    const p = progress.get();
    if (open === index) {
      // Reduced motion: the bubble dips out and back in at the edge instead of travelling.
      if (reduced) {
        return {
          opacity: interpolate(p, [0, 0.5, 1], [1, 0, 1]),
          transform: [{ translateX: p < 0.5 ? 0 : dx }],
        };
      }
      return { opacity: 1, transform: [{ translateX: interpolate(p, [0, 1], [0, dx]) }] };
    }
    return {
      opacity: interpolate(p, [0, 0.6], [1, 0], Extrapolation.CLAMP),
      transform: [{ translateX: reduced || open == null ? 0 : interpolate(p, [0, 1], [0, 40]) }],
    };
  });
  return (
    <Animated.View onLayout={(e) => onLayout(e.nativeEvent.layout.x)} style={style}>
      {children}
    </Animated.View>
  );
}
