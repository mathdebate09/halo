import { Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/button';
import { HeroBackdrop } from '@/components/hero-backdrop';
import { replayReveal } from '@/components/reveal';
import { goNext, useStepFocus } from '@/onboarding/navigation';
import { useStatusBarStyle } from '@/theme/status-bar';
import { ImageScope } from '@/theme/theme-provider';

// scr 19: the journey begins on the hero Today will show (high tier, set at plan time). The image
// drifts to exactly 1×, then the root crossfades to Today drawing the identical hero, so only the
// content changes and Today's content rises in. Copy rises in once; reduced motion fades only.
const rise = (i: number) => FadeInDown.duration(600).delay(250 + i * 90);

export default function ReadyStep() {
  useStepFocus('ready');
  useStatusBarStyle('light');
  const insets = useSafeAreaInsets();
  return (
    <ImageScope style={{ flex: 1 }}>
      <HeroBackdrop drift />
      <View className="flex-1 justify-end px-6" style={{ paddingBottom: insets.bottom + 16 }}>
        <Animated.View entering={rise(0)}>
          <Text
            accessibilityRole="header"
            className="font-serif text-[48px] leading-[52px] text-text">
            Your plan is ready
          </Text>
        </Animated.View>
        <Animated.View entering={rise(1)} className="mt-8">
          <PrimaryButton
            label="Explore the app"
            onPress={() => {
              replayReveal(350);
              goNext('ready');
            }}
          />
        </Animated.View>
      </View>
    </ImageScope>
  );
}
