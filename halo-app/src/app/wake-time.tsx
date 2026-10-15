import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { Easing, FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  readLearned,
  refreshLearned,
  WAKE_ASK_DONE_KEY,
  WAKE_ASKED_KEY,
} from '@/assistant/learned';
import { PrimaryButton, QuietButton } from '@/components/button';
import { showToast } from '@/components/toast';
import { WHEEL_ITEM_HEIGHT, WheelPicker } from '@/components/wheel-picker';
import { uses24h } from '@/lib/clock';
import { kv } from '@/lib/kv';
import { formatClock } from '@/shared';

// The day-3 wake-time ask (SPEC §4 "Learning"): asked once, from the PA's brief, only while the
// wake time is still a guess. The answer sets tonight's bedtime, quiet hours and the weigh-in.

const EASE_SHEET = Easing.bezier(0.32, 0.72, 0, 1);
const FIRST = 4;
const LAST = 12;
const STEP = 0.25;
const HOURS = Array.from({ length: (LAST - FIRST) / STEP + 1 }, (_, i) => FIRST + i * STEP);

export default function WakeTimeSheet() {
  const insets = useSafeAreaInsets();
  const h24 = uses24h();
  const current = readLearned()?.wake.weekday.value ?? 7;
  const [index, setIndex] = useState(() =>
    Math.max(0, Math.min(HOURS.length - 1, Math.round((current - FIRST) / STEP))),
  );
  const hour = HOURS[index]!;

  const close = (answer: number | null) => {
    if (answer != null) kv.set(WAKE_ASKED_KEY, answer);
    kv.set(WAKE_ASK_DONE_KEY, true);
    refreshLearned();
    router.back();
    if (answer != null) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      showToast('Wake time set');
    }
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
        className="rounded-t-card border-x border-t border-hairline/10 bg-surface pt-3">
        <View className="mb-2 h-1 w-10 self-center rounded-pill bg-glass/20" />
        <Text
          className="mt-2 text-center font-sans-medium text-[17px] text-text"
          accessibilityRole="header">
          When do you usually wake up?
        </Text>

        <View className="mx-10 mt-6">
          {/* The centre band marks the selected row. */}
          <View
            pointerEvents="none"
            style={{ top: WHEEL_ITEM_HEIGHT * 2, height: WHEEL_ITEM_HEIGHT }}
            className="absolute inset-x-0 rounded-2xl bg-glass/10"
          />
          <WheelPicker
            accessibilityLabel="Wake time"
            items={HOURS.map((h) => formatClock(h, h24))}
            selectedIndex={index}
            onChange={setIndex}
          />
        </View>

        <View className="mt-8 px-6">
          <PrimaryButton label={`Save ${formatClock(hour, h24)}`} onPress={() => close(hour)} />
          <QuietButton label="Not now" onPress={() => close(null)} />
        </View>
        {/* A plain View: NativeWind drops `style` on an Animated.View that also has className. */}
        <View style={{ height: insets.bottom + 16 }} />
      </Animated.View>
    </View>
  );
}
