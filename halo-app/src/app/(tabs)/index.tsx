import { router, useFocusEffect, useIsFocused } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Extrapolation,
  FadeIn,
  FadeOut,
  interpolate,
  LayoutAnimationConfig,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { runAction } from '@/assistant/actions';
import { useAssistant } from '@/assistant/assistant';
import { recordShown } from '@/assistant/loop-store';
import { useBriefWords } from '@/assistant/phrasing';
import { useDockInset } from '@/components/dock';
import { HeroBackdrop } from '@/components/hero-backdrop';
import { DietIcon, ExerciseIcon, ShareIcon, VitalsIcon } from '@/components/icons';
import { PressScale } from '@/components/press-scale';
import { Reveal } from '@/components/reveal';
import { ScoreArc, ScoreScrim } from '@/components/score-arc';
import { ScoreChip } from '@/components/score-chip';
import { ThemedScreen } from '@/components/themed-screen';
import { refreshHealthData } from '@/lib/health-connect';
import { setShareSnapshot } from '@/share/snapshot';
import { PendingMealCard } from '@/meals/pending-meal-card';
import { hourOfDay } from '@/shared';
import { motion } from '@/theme/motion';
import { useHaloTheme } from '@/theme/theme-provider';
import { briefCopy, todayCopy } from '@/today/copy';
import { prefetchHeroes } from '@/today/prefetch';
import { useMealCelebration } from '@/today/celebration';
import { LearnMore } from '@/today/learn-more';
import { useTodayScores } from '@/today/today-scores';

// Today's hero, laid out like Oura's home on screen-height fractions so the arc sits over the
// image's focus point and the text lands in the zones scripts/build-themes.mjs verified for
// contrast (tagline 0.50-0.57, body 0.57-0.70). Learn more scrolls on to the day's summary.
const CHIPS_AT = 0.135;
const SCORE_AT = 0.43;
const SCORE_SIZE = 112;
// Instrument Serif's ascenders overflow a line height equal to the font size.
const SCORE_LINE = 132;
const LABEL_AT = 0.478;
const TEXT_AT = 0.522;
/** The wordmark bar that stays on top once the hero has scrolled away. */
const HEADER_HEIGHT = 48;

export default function TodayScreen() {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const [size, setSize] = useState({ width: window.width, height: window.height });
  const { theme, target } = useHaloTheme();
  const scores = useTodayScores();
  const focused = useIsFocused();
  const glow = useMealCelebration(scores, focused);
  const { brief, phrase } = useAssistant();
  const words = useBriefWords(brief, phrase);
  // On-track days have no step: the tier's lines and Learn more speak for themselves.
  const stepAction =
    brief.insight.type !== 'on_track' && words.actionLabel ? brief.insight.action : null;
  // The tier's own words (the share card keeps these); the hero says what the PA brings.
  const tierCopy = todayCopy(target.tier, scores.day, hourOfDay(scores.now), scores.provisional);
  const copy = briefCopy(brief, words, tierCopy);
  const briefId = brief.insight.id;
  useEffect(() => {
    if (focused) recordShown(brief.insight, scores.day, 'today');
    // The brief object is new every render; its id is what matters.
  }, [briefId, focused]);
  const { width, height } = size;
  const dockInset = useDockInset();
  const scroll = useRef<Animated.ScrollView>(null);
  const learnY = useRef(0);
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.set(e.contentOffset.y);
  });
  // Learn more's words reveal once the section is reached (or Learn more is tapped).
  const [armed, setArmed] = useState(false);
  useAnimatedReaction(
    () => scrollY.get() > height * 0.3,
    (reached, before) => {
      if (reached && !before) scheduleOnRN(setArmed, true);
    },
  );
  const scrimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.get(), [height * 0.55, height * 0.8], [0, 1], Extrapolation.CLAMP),
  }));

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
      <Animated.ScrollView
        ref={scroll}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        style={styles.fill}
        onLayout={(e) => {
          const { width: w, height: h } = e.nativeEvent.layout;
          if (w !== width || h !== height) setSize({ width: w, height: h });
        }}>
        {/* The hero: one screen tall, scrolling away (its image a little slower) for Learn more. */}
        {/* Clipped, so the parallaxed image never spills under the summary. */}
        <View style={{ height, overflow: 'hidden' }}>
          <HeroBackdrop scrollY={scrollY} />
          <Reveal
            index={0}
            className="absolute inset-x-0 flex-row items-center justify-between px-5"
            style={{ top: insets.top + 8 }}>
            <View className="h-11 w-11" />
            {/* Long-press the wordmark for the hidden developer screen. */}
            <Pressable onLongPress={() => router.push('/dev')} delayLongPress={600} hitSlop={12}>
              <Text className="font-wordmark text-[28px] text-text">Halo</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Share"
              onPress={() => {
                setShareSnapshot(scores, tierCopy.tagline, theme);
                router.push('/share');
              }}
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
            <Reveal index={4} className="items-center">
              {/* The brief's prepared step, one tap away; Learn more steps back to a link. */}
              {stepAction ? (
                <Animated.View
                  key={`step:${briefId}`}
                  entering={FadeIn.duration(400).easing(motion.calm)}>
                  <PressScale
                    accessibilityRole="button"
                    onPress={() => runAction(stepAction, briefId)}
                    className="mt-7 rounded-pill bg-text px-8 py-3.5">
                    <Text className="font-sans-medium text-[16px] text-bg">
                      {words.actionLabel}
                    </Text>
                  </PressScale>
                </Animated.View>
              ) : null}
              <PressScale
                accessibilityRole="button"
                onPress={() => {
                  setArmed(true);
                  scroll.current?.scrollTo({
                    y: learnY.current - insets.top - HEADER_HEIGHT,
                    animated: true,
                  });
                }}
                className={
                  stepAction ? 'mt-2 px-6 py-3' : 'mt-7 rounded-pill bg-glass/10 px-8 py-3.5'
                }>
                <Text
                  className={`font-sans-medium text-[16px] ${stepAction ? 'text-text/80' : 'text-text'}`}>
                  Learn more
                </Text>
              </PressScale>
            </Reveal>
          </View>
        </View>

        <View
          className="px-4 pt-3"
          style={{ paddingBottom: dockInset }}
          onLayout={(e) => {
            learnY.current = e.nativeEvent.layout.y;
          }}>
          <LearnMore scores={scores} armed={armed} />
        </View>
      </Animated.ScrollView>

      {/* Once the hero has scrolled away, Halo stays on top over the theme background. */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.scrim,
          { height: insets.top + HEADER_HEIGHT, backgroundColor: theme.colors.bg },
          scrimStyle,
        ]}>
        <View className="flex-1 items-center justify-end pb-2">
          <Text className="font-wordmark text-[24px] text-text">Halo</Text>
        </View>
      </Animated.View>
      {/* Meals between capture and logging: a nudge into the Meal Logger. */}
      <PendingMealCard />
    </ThemedScreen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0 },
});
