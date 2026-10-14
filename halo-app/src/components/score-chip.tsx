import type { ComponentType } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeIn, LayoutAnimationConfig } from 'react-native-reanimated';

import { motion } from '@/theme/motion';

type Props = {
  label: string;
  /** 0-100. */
  value: number;
  Icon: ComponentType<{ size?: number; color: string }>;
  color: string;
};

/** A glass circle with a component score (Oura's contributor chips). */
export function ScoreChip({ label, value, Icon, color }: Props) {
  return (
    <View className="items-center" accessible accessibilityLabel={`${label} ${Math.round(value)}`}>
      <View className="h-[76px] w-[76px] items-center justify-center rounded-full border border-hairline/15 bg-glass/10">
        <Icon size={15} color={color} />
        {/* A new value fades in (logging is occasional); not on first mount, Reveal covers that. */}
        <LayoutAnimationConfig skipEntering>
          <Animated.Text
            key={Math.round(value)}
            entering={FadeIn.duration(400).easing(motion.calm)}
            className="mt-0.5 font-sans text-[24px] leading-[28px] text-text">
            {Math.round(value)}
          </Animated.Text>
        </LayoutAnimationConfig>
      </View>
      <Text className="mt-2 font-sans text-[15px] text-text/90">{label}</Text>
    </View>
  );
}
