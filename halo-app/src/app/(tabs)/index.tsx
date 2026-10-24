import { router, useFocusEffect, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
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
import { Reveal } from '@/components/reveal';
import { ThemedScreen } from '@/components/themed-screen';
import { useScrollReset } from '@/hooks/use-scroll-reset';
import { refreshHealthData } from '@/lib/health-connect';
import { PendingMealCard } from '@/meals/pending-meal-card';
import { hourOfDay } from '@/shared';
import { useStatusBarStyle } from '@/theme/status-bar';
import { ImageScope, useHaloTheme } from '@/theme/theme-provider';
import { themes } from '@/theme/themes';
import { TodayChips } from '@/today/chip-tips';
import { briefCopy, todayCopy } from '@/today/copy';
import { HeroBrief } from '@/today/hero-brief';
import { HeroScore } from '@/today/hero-score';
import { prefetchHeroes } from '@/today/prefetch';
import { useMealCelebration } from '@/today/celebration';
import { LearnMore } from '@/today/learn-more';
import { useTodayScores } from '@/today/today-scores';
import { TodayTopBar } from '@/today/top-bar';

// Today's hero, laid out like Oura's home on screen-height fractions so the arc sits over the
// image's focus point and the text lands in the zones scripts/build-themes.mjs verified for
// contrast (tagline 0.50-0.57, body 0.57-0.70). Learn more scrolls on to the day's summary.
// The hero's parts: top-bar, hero-score and hero-brief in src/today/.
const CHIPS_AT = 0.135;
/** The wordmark bar that stays on top once the hero has scrolled away. */
const HEADER_HEIGHT = 48;

export default function TodayScreen() {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const [size, setSize] = useState({ width: window.width, height: window.height });
  const { theme, target } = useHaloTheme();
  // The hero sits on the photo: its colors are the theme's dark ones in either mode.
  const hero = themes[theme.id];
  const scores = useTodayScores();
  const focused = useIsFocused();
  // A voice reply from the ring asked for Usage access or Health Connect: Halo opens here and asks.
  const { ask } = useLocalSearchParams<{ ask?: string }>();
  useEffect(() => {
    if (ask !== 'usage_access' && ask !== 'connect') return;
    router.setParams({ ask: undefined });
    void runAction({ kind: ask });
  }, [ask]);
  const glow = useMealCelebration(scores, focused);
  const { brief, phrase } = useAssistant();
  const words = useBriefWords(brief, phrase);
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
  // Light status bar icons over the photo; once the Halo bar covers it, the mode's own.
  const [heroAway, setHeroAway] = useState(false);
  useAnimatedReaction(
    () => scrollY.get() > height * 0.7,
    (away, before) => {
      if (away !== before) scheduleOnRN(setHeroAway, away);
    },
  );
  useStatusBarStyle(heroAway ? null : 'light');
  useScrollReset(scroll, () => {
    scrollY.set(0);
    setArmed(false);
    setHeroAway(false);
  });
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
        <ImageScope style={{ height, overflow: 'hidden' }}>
          <HeroBackdrop scrollY={scrollY} />
          <TodayTopBar top={insets.top + 8} tagline={tierCopy.tagline} />

          <Reveal
            index={1}
            className="absolute inset-x-0"
            style={{ top: Math.max(CHIPS_AT * height, insets.top + 64) }}>
            <TodayChips
              scores={scores}
              scrollY={scrollY}
              closeAt={height * 0.15}
              color={hero.colors.text}
              words={words}
            />
          </Reveal>

          <HeroScore
            score={scores.overall}
            provisional={scores.provisional}
            glow={glow}
            width={width}
            height={height}
          />
          <HeroBrief
            height={height}
            tagline={copy.tagline}
            body={copy.body}
            onLearnMore={() => {
              setArmed(true);
              scroll.current?.scrollTo({
                y: learnY.current - insets.top - HEADER_HEIGHT,
                animated: true,
              });
            }}
          />
        </ImageScope>

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
