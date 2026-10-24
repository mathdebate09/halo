import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { MoonIcon, ShareIcon, SunIcon } from '@/components/icons';
import { PressScale } from '@/components/press-scale';
import { Reveal } from '@/components/reveal';
import { OverlayAskButton } from '@/overlay/ask-button';
import { setShareSnapshot } from '@/share/snapshot';
import { motion } from '@/theme/motion';
import { useHaloTheme } from '@/theme/theme-provider';
import { themes } from '@/theme/themes';
import { useTodayScores } from '@/today/today-scores';
import { VoiceAskButton } from '@/voice/ask-button';

/**
 * The hero's top row: the overlay and voice asks, the Halo wordmark (long-press for the dev
 * screen), the light/dark switch and Share. `tagline` is the tier's own words for the share card.
 */
export function TodayTopBar({ top, tagline }: { top: number; tagline: string }) {
  const { theme, mode, setMode } = useHaloTheme();
  // The hero sits on the photo: its colors are the theme's dark ones in either mode.
  const hero = themes[theme.id];
  const scores = useTodayScores();
  return (
    <Reveal
      index={0}
      className="absolute inset-x-0 flex-row items-center justify-between px-5"
      style={{ top }}>
      {/* As wide as the buttons on the right, so the wordmark stays centred. While the overlay
          isn't allowed, its ask sits here, then the voice ask. */}
      <View className="h-11 w-[96px] flex-row items-center">
        <OverlayAskButton color={hero.colors.text} />
        <VoiceAskButton color={hero.colors.text} />
      </View>
      {/* Long-press the wordmark for the hidden developer screen (dev builds only). */}
      <Pressable
        onLongPress={__DEV__ ? () => router.push('/dev') : undefined}
        delayLongPress={600}
        hitSlop={12}>
        <Text className="font-wordmark text-[28px] text-text">Halo</Text>
      </Pressable>
      <View className="w-[96px] flex-row justify-end gap-2">
        <PressScale
          accessibilityRole="button"
          accessibilityLabel={mode === 'light' ? 'Dark mode' : 'Light mode'}
          onPress={() => setMode(mode === 'light' ? 'dark' : 'light')}
          hitSlop={4}
          className="h-11 w-11 items-center justify-center">
          {/* The mode it switches to; the icons trade places with a short fade. */}
          <Animated.View
            key={mode}
            entering={FadeIn.duration(200).easing(motion.calm)}
            exiting={FadeOut.duration(150)}
            className="absolute">
            {mode === 'light' ? (
              <MoonIcon size={22} color={hero.colors.text} />
            ) : (
              <SunIcon size={24} color={hero.colors.text} />
            )}
          </Animated.View>
        </PressScale>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Share"
          onPress={() => {
            setShareSnapshot(scores, tagline, hero);
            router.push('/share');
          }}
          hitSlop={8}
          className="h-11 w-11 items-center justify-center rounded-full active:bg-glass/10">
          <ShareIcon size={24} color={hero.colors.text} />
        </Pressable>
      </View>
    </Reveal>
  );
}
