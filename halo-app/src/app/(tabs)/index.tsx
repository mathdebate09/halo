import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LayoutAnimationConfig } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HeroBackdrop } from '@/components/hero-backdrop';
import { DietIcon, ExerciseIcon, ShareIcon, VitalsIcon } from '@/components/icons';
import { PressScale } from '@/components/press-scale';
import { Reveal } from '@/components/reveal';
import { ScoreArc, ScoreScrim } from '@/components/score-arc';
import { ScoreChip } from '@/components/score-chip';
import { ThemedScreen } from '@/components/themed-screen';
import { refreshHealthData } from '@/lib/health-connect';
import { PendingMealCard } from '@/meals/pending-meal-card';
import { hourOfDay } from '@/shared';
import { motion } from '@/theme/motion';
import { useHaloTheme } from '@/theme/theme-provider';
import { todayCopy } from '@/today/copy';
import { prefetchHeroes } from '@/today/prefetch';
import { useMealCelebration } from '@/today/celebration';
import { useTodayScores } from '@/today/today-scores';

// Today's hero, laid out like Oura's home on screen-height fractions so the arc sits over the
// image's focus point and the text lands in the zones scripts/build-themes.mjs verified for
// contrast (tagline 0.50-0.57, body 0.57-0.70). "Learn more" content arrives in chunk 14.
const CHIPS_AT = 0.135;
const SCORE_AT = 0.43;
const SCORE_SIZE = 112;
// Instrument Serif's ascenders overflow a line height equal to the font size.
const SCORE_LINE = 132;
const LABEL_AT = 0.478;
const TEXT_AT = 0.522;

export default function TodayScreen() {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const [size, setSize] = useState({ width: window.width, height: window.height });
  const { theme, target } = useHaloTheme();
  const scores = useTodayScores();
  const glow = useMealCelebration(scores);
  const copy = todayCopy(target.tier, scores.day, hourOfDay(scores.now), scores.provisional);
  const { width, height } = size;

  useFocusEffect(
    useCallback(() => {
      refreshHealthData();
    }, []),
  );

  // Other heroes are disk-cached once the entrance has settled, never during first paint.
  useEffect(() => {
    const timer = setTimeout(() => prefetchHeroes(target.id), 2500);
    return () => clearTimeout(timer);
  }, [target.id]);

  return (
    <ThemedScreen>
      <HeroBackdrop />
      <View
        className="flex-1"
        onLayout={(e) => {
          const { width: w, height: h } = e.nativeEvent.layout;
          if (w !== width || h !== height) setSize({ width: w, height: h });
        }}>
        <Reveal
          index={0}
          className="absolute inset-x-0 flex-row items-center justify-between px-5"
          style={{ top: insets.top + 8 }}>
          <View className="h-11 w-11" />
          {/* Long-press the wordmark for the hidden developer screen. */}
          <Pressable onLongPress={() => router.push('/dev')} delayLongPress={600} hitSlop={12}>
            <Text className="font-wordmark text-[28px] text-text">Halo</Text>
          </Pressable>
          {/* The share composer arrives in chunk 15. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Share"
            hitSlop={8}
            className="h-11 w-11 items-center justify-center rounded-full active:bg-glass/10">
            <ShareIcon size={24} color={theme.colors.text} />
          </Pressable>
        </Reveal>

        <Reveal
          index={1}
          className="absolute inset-x-0 flex-row justify-center gap-5"
          style={{ top: Math.max(CHIPS_AT * height, insets.top + 64) }}>
          <ScoreChip
            label="Diet"
            value={scores.diet.value}
            Icon={DietIcon}
            color={theme.colors.text}
          />
          <ScoreChip
            label="Activity"
            value={scores.activity.value}
            Icon={ExerciseIcon}
            color={theme.colors.text}
          />
          <ScoreChip
            label="Vitals"
            value={scores.vitals.value}
            Icon={VitalsIcon}
            color={theme.colors.text}
          />
        </Reveal>

        <Reveal index={2} className="absolute inset-0" pointerEvents="none">
          <ScoreScrim centerY={SCORE_AT * height} width={width} />
          <ScoreArc
            score={scores.overall}
            provisional={scores.provisional}
            glow={glow}
            width={width}
            height={height}
          />
          <View
            className="absolute inset-x-0 items-center"
            style={{ top: SCORE_AT * height - SCORE_LINE / 2, height: SCORE_LINE }}
            accessible
            accessibilityLabel={`${scores.provisional ? 'Early read' : 'Overall score'} ${scores.overall}`}>
            <LayoutAnimationConfig skipEntering>
              <Animated.Text
                key={scores.overall}
                entering={FadeIn.duration(500)}
                exiting={FadeOut.duration(300)}
                className="absolute font-serif text-text"
                style={{ fontSize: SCORE_SIZE, lineHeight: SCORE_LINE }}>
                {scores.overall}
              </Animated.Text>
            </LayoutAnimationConfig>
          </View>
          <Text
            className="absolute inset-x-0 text-center font-sans-medium text-[13px] tracking-[2px] text-text/90"
            style={{ top: LABEL_AT * height }}>
            {scores.provisional ? 'EARLY READ' : 'OVERALL'}
          </Text>
        </Reveal>

        <View className="absolute inset-x-0 items-center px-6" style={{ top: TEXT_AT * height }}>
          <Reveal index={3} className="items-center">
            {/* New words (tier, time of day, first real score) fade in rather than swap. */}
            <LayoutAnimationConfig skipEntering>
              <Animated.View
                key={`${copy.tagline}|${copy.body}`}
                entering={FadeIn.duration(500).easing(motion.calm)}
                className="items-center">
                <Text className="text-center font-serif text-[48px] leading-[54px] text-text">
                  {copy.tagline}
                </Text>
                <Text className="mt-3 text-center font-sans text-[17px] leading-[26px] text-text/85">
                  {copy.body}
                </Text>
              </Animated.View>
            </LayoutAnimationConfig>
          </Reveal>
          <Reveal index={4}>
            {/* Scrolls to the in-depth summary once it exists (chunk 14). */}
            <PressScale
              accessibilityRole="button"
              className="mt-7 rounded-pill bg-glass/10 px-8 py-3.5">
              <Text className="font-sans-medium text-[16px] text-text">Learn more</Text>
            </PressScale>
          </Reveal>
        </View>
      </View>
      {/* Meals between capture and logging (the timeline arrives in chunk 14). */}
      <PendingMealCard />
    </ThemedScreen>
  );
}
