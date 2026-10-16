import { Camera } from 'expo-camera';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Notifications from 'expo-notifications';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/button';
import { kv } from '@/lib/kv';
import { goNext, useStepFocus } from '@/onboarding/navigation';
import { useStatusBarStyle } from '@/theme/status-bar';
import { ImageScope, useHaloTheme } from '@/theme/theme-provider';
import { themes, withAlpha } from '@/theme/themes';

// scr 2: the welcome slide. A calm hero photo with the copy settled at the bottom (Oura's language).
const HERO = themes['high-2'];

/**
 * Notifications (meal nudges) and the camera (meal photos) are asked up front, back to back, so
 * no later screen exists just for a permission. Either can be denied: everything still works.
 */
async function askPermissions() {
  try {
    const notifications = await Notifications.requestPermissionsAsync();
    kv.set('notifications.granted', notifications.granted);
    await Camera.requestCameraPermissionsAsync();
  } catch {
    // A failed request is the same as a denial.
  }
}

export default function IntroStep() {
  useStepFocus('intro');
  useStatusBarStyle('light');
  const insets = useSafeAreaInsets();
  // Over the photo: the theme's dark tokens in either mode.
  const theme = themes[useHaloTheme().theme.id];

  return (
    <ImageScope style={{ flex: 1 }}>
      <Image
        source={{ uri: HERO.image }}
        placeholder={{ blurhash: HERO.blurhash }}
        contentFit="cover"
        cachePolicy="disk"
        transition={400}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={[
          withAlpha(theme.colors.bg, 0.25),
          withAlpha(theme.colors.bg, 0.05),
          withAlpha(theme.colors.bg, 0.85),
          theme.colors.bg,
        ]}
        locations={[0, 0.35, 0.68, 0.86]}
        style={StyleSheet.absoluteFill}
      />
      <View className="flex-1 justify-end px-6" style={{ paddingBottom: insets.bottom + 16 }}>
        <Animated.View entering={FadeInDown.duration(600).delay(200)}>
          <Text className="font-wordmark text-[22px] text-text/90">Halo</Text>
          <Text
            accessibilityRole="header"
            className="mt-3 font-serif text-[44px] leading-[48px] text-text">
            Your food, habits and goals, understood.
          </Text>
          <Text className="mb-8 mt-4 font-sans text-[17px] leading-[25px] text-text/80">
            Halo reads what you eat, how you move and how you sleep, then tells you the one thing to
            do next.
          </Text>
        </Animated.View>
        <Animated.View entering={FadeInDown.duration(600).delay(320)}>
          <PrimaryButton
            label="Get started"
            onPress={async () => {
              await askPermissions();
              goNext('intro');
            }}
          />
        </Animated.View>
      </View>
    </ImageScope>
  );
}
