import { router, useLocalSearchParams } from 'expo-router';
import { BackHandler, Pressable, View } from 'react-native';
import Animated, { Easing, FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { QuietButton } from '@/components/button';
import { useVoiceAccess } from '@/voice/access';
import { VoiceCard } from '@/voice/voice-card';

// Talking to the ring before it's allowed (chunk 27): the ring opens this over Halo with
// `from=ring`, Today's mic button without. Once allowed from the ring, Halo steps away again so the
// user lands back in the app they were using, and the next tap on the ring listens.

const EASE_SHEET = Easing.bezier(0.32, 0.72, 0, 1);

export default function VoiceAccessSheet() {
  const insets = useSafeAreaInsets();
  const { from } = useLocalSearchParams<{ from?: string }>();
  // The panel slides in once its content is known: one that grows after entering sticks low.
  const access = useVoiceAccess();

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <View className="flex-1 justify-end">
      <Animated.View entering={FadeIn.duration(300)} className="absolute inset-0">
        <Pressable accessibilityLabel="Close" onPress={close} className="flex-1 bg-veil/60" />
      </Animated.View>
      {access == null ? null : (
        <Animated.View
          accessibilityViewIsModal
          entering={SlideInDown.duration(400).easing(EASE_SHEET)}
          className="rounded-t-card border-x border-t border-hairline/10 bg-surface px-5 pt-3">
          <View className="mb-2 h-1 w-10 self-center rounded-pill bg-glass/20" />
          <VoiceCard
            onAllowed={(access) => {
              if (access !== 'allowed') return;
              if (from === 'ring') BackHandler.exitApp();
              else close();
            }}
          />
          <View className="mt-3 items-center">
            <QuietButton label="Not now" onPress={close} />
          </View>
          {/* A plain View: NativeWind drops `style` on an Animated.View that also has className. */}
          <View style={{ height: insets.bottom + 12 }} />
        </Animated.View>
      )}
    </View>
  );
}
