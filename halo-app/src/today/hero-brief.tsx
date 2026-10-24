import { Text, View } from 'react-native';
import Animated, { FadeIn, LayoutAnimationConfig } from 'react-native-reanimated';

import { PressScale } from '@/components/press-scale';
import { Reveal } from '@/components/reveal';
import { motion } from '@/theme/motion';

// Top of the text, as a screen-height fraction: the zones scripts/build-themes.mjs verified for
// contrast (tagline 0.50-0.57, body 0.57-0.70).
const TEXT_AT = 0.522;

/** The hero's words (the brief's tagline and line) and the Learn more button under them. */
export function HeroBrief({
  height,
  tagline,
  body,
  onLearnMore,
}: {
  height: number;
  tagline: string;
  body: string;
  onLearnMore: () => void;
}) {
  return (
    <View className="absolute inset-x-0 items-center px-6" style={{ top: TEXT_AT * height }}>
      {/* Full width: Android under-measures the serif in a shrink-wrapped box and wraps
          short taglines ("Water / break"). */}
      <Reveal index={3} className="w-full items-center">
        {/* New words (tier, time of day, first real score) fade in rather than swap. */}
        <LayoutAnimationConfig skipEntering>
          <Animated.View
            key={`${tagline}|${body}`}
            entering={FadeIn.duration(500).easing(motion.calm)}
            className="w-full items-center">
            <Text className="w-full text-center font-serif text-[48px] leading-[54px] text-text">
              {tagline}
            </Text>
            <Text className="mt-3 text-center font-sans text-[17px] leading-[26px] text-text/85">
              {body}
            </Text>
          </Animated.View>
        </LayoutAnimationConfig>
      </Reveal>
      <Reveal index={4} className="items-center">
        <PressScale
          accessibilityRole="button"
          onPress={onLearnMore}
          className="mt-7 rounded-pill bg-glass/10 px-8 py-3.5">
          <Text className="font-sans-medium text-[16px] text-text">Learn more</Text>
        </PressScale>
      </Reveal>
    </View>
  );
}
