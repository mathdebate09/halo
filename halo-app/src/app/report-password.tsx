import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  SlideInDown,
  useAnimatedKeyboard,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton, QuietButton } from '@/components/button';
import { cancelPending, unlockPending } from '@/reports/add';
import { useHaloTheme } from '@/theme/theme-provider';

// A locked report PDF's password (Android 15+ opens them). It's used to read the pages and then
// forgotten: never stored, never sent.

const EASE_SHEET = Easing.bezier(0.32, 0.72, 0, 1);
const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);

export default function ReportPasswordSheet() {
  const insets = useSafeAreaInsets();
  const { theme } = useHaloTheme();
  const [password, setPassword] = useState('');
  const [wrong, setWrong] = useState(false);
  const [busy, setBusy] = useState(false);
  const opened = useRef(false);
  const reduced = useReducedMotion();
  // A wrong password nudges the field side to side (skipped under reduced motion).
  const shake = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.get() }] }));
  // The sheet rides on the keyboard (KeyboardAvoidingView mis-measures inside this modal).
  const keyboard = useAnimatedKeyboard();
  const lift = useAnimatedStyle(() => ({
    paddingBottom: Math.max(0, keyboard.height.get() - insets.bottom),
  }));

  // Leaving without opening it (back, a tap outside, Cancel) drops the picked copy.
  useEffect(() => () => void (opened.current || cancelPending()), []);

  const open = async () => {
    if (!password || busy) return;
    setBusy(true);
    const result = await unlockPending(password);
    setBusy(false);
    if (result === 'wrong') {
      setWrong(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      if (!reduced) {
        const step = (to: number) => withTiming(to, { duration: 80, easing: EASE_IN_OUT });
        shake.set(withSequence(step(-6), step(6), step(-3), step(0)));
      }
      return;
    }
    opened.current = result === 'ok';
    router.back();
  };

  return (
    <View className="flex-1 justify-end">
      <Animated.View entering={FadeIn.duration(300)} className="absolute inset-0">
        <Pressable
          accessibilityLabel="Close"
          onPress={() => router.back()}
          className="flex-1 bg-veil/60"
        />
      </Animated.View>
      <Animated.View
        accessibilityViewIsModal
        entering={SlideInDown.duration(400).easing(EASE_SHEET)}
        className="rounded-t-card border-x border-t border-hairline/10 bg-surface px-6 pt-3">
        <View className="mb-2 h-1 w-10 self-center rounded-pill bg-glass/20" />
        <Text
          accessibilityRole="header"
          className="mt-2 text-center font-sans-medium text-[17px] text-text">
          This PDF is locked
        </Text>
        <Animated.View style={shakeStyle}>
          <TextInput
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              setWrong(false);
            }}
            onSubmitEditing={open}
            autoFocus
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            placeholder="Password"
            placeholderTextColor={theme.colors.muted}
            accessibilityLabel="Password"
            // Keep the keyboard up after a wrong password.
            submitBehavior="submit"
            className="mt-6 rounded-2xl bg-glass/10 px-5 py-4 font-sans text-[17px] text-text"
          />
        </Animated.View>
        <View accessibilityLiveRegion="polite" className="mt-2 h-5 px-1">
          {wrong ? (
            <Animated.View entering={FadeIn.duration(200)}>
              <Text className="font-sans text-[14px]" style={{ color: theme.colors.opportunity }}>
                That password didn’t open it
              </Text>
            </Animated.View>
          ) : null}
        </View>
        <View className="mt-4">
          <PrimaryButton label="Open" onPress={open} disabled={!password || busy} />
          <QuietButton label="Cancel" onPress={() => router.back()} />
        </View>
        {/* A plain View: NativeWind drops `style` on an Animated.View that also has className. */}
        <View style={{ height: insets.bottom + 16 }} />
      </Animated.View>
      <Animated.View style={lift} />
    </View>
  );
}
