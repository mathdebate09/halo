import { eq } from 'drizzle-orm';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { Easing, FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton, QuietButton } from '@/components/button';
import { showToast } from '@/components/toast';
import { WHEEL_ITEM_HEIGHT, WheelPicker } from '@/components/wheel-picker';
import { db } from '@/db/client';
import { deleteRecord, upsertRecord } from '@/db/mutate';
import { vitalsReadings } from '@/db/schema';
import { dayStart } from '@/shared';
import { SLEEP_METRIC } from '@/vitals/inputs';

// The one-tap correction for a night Halo estimated from phone use (SPEC §6: the user can correct
// an estimate). The answer replaces the estimate for that night, counts as measured and syncs.

const EASE_SHEET = Easing.bezier(0.32, 0.72, 0, 1);
const FIRST = 3;
const LAST = 12;
const STEP = 0.25;
const HOURS = Array.from({ length: (LAST - FIRST) / STEP + 1 }, (_, i) => FIRST + i * STEP);

/** "7 h 15 min", "8 h". */
const label = (h: number) => {
  const whole = Math.floor(h);
  const min = Math.round((h - whole) * 60);
  return min ? `${whole} h ${min} min` : `${whole} h`;
};

/** One correction per night, so correcting again replaces it. */
const idFor = (day: string) => `sleep-${day}`;

export default function SleepHoursSheet() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ day: string; hours?: string }>();
  const day = params.day;
  const id = idFor(day);
  // Read once, synchronously, so the sheet opens at its final height.
  const [corrected] = useState(() => {
    const row = db
      .select({ deletedAt: vitalsReadings.deletedAt })
      .from(vitalsReadings)
      .where(eq(vitalsReadings.id, id))
      .get();
    return row != null && row.deletedAt == null;
  });
  const start = Number(params.hours) || 7.5;
  const [index, setIndex] = useState(() =>
    Math.max(0, Math.min(HOURS.length - 1, Math.round((start - FIRST) / STEP))),
  );
  const hours = HOURS[index]!;

  const save = () => {
    upsertRecord('vitalReading', {
      id,
      metric: SLEEP_METRIC,
      value: hours,
      unit: 'h',
      // Midday of the night's day, so it lands on that day whatever the time zone of the read.
      at: dayStart(day, 12).getTime(),
      source: 'manual',
      confirmed: true,
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
    showToast('Sleep updated');
  };

  const useEstimate = () => {
    deleteRecord('vitalReading', id);
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
        className="rounded-t-card border-x border-t border-hairline/10 bg-surface pt-3">
        <View className="mb-2 h-1 w-10 self-center rounded-pill bg-glass/20" />
        <Text
          className="mt-2 text-center font-sans-medium text-[17px] text-text"
          accessibilityRole="header">
          How long did you sleep?
        </Text>

        <View className="mx-10 mt-6">
          {/* The centre band marks the selected row. */}
          <View
            pointerEvents="none"
            style={{ top: WHEEL_ITEM_HEIGHT * 2, height: WHEEL_ITEM_HEIGHT }}
            className="absolute inset-x-0 rounded-2xl bg-glass/10"
          />
          <WheelPicker
            accessibilityLabel="Hours slept"
            items={HOURS.map(label)}
            selectedIndex={index}
            onChange={setIndex}
          />
        </View>

        <View className="mt-8 px-6">
          <PrimaryButton label={`Save ${label(hours)}`} onPress={save} />
          {corrected ? (
            <QuietButton label="Use the estimate" onPress={useEstimate} />
          ) : (
            <QuietButton label="Cancel" onPress={() => router.back()} />
          )}
        </View>
        {/* A plain View: NativeWind drops `style` on an Animated.View that also has className. */}
        <View style={{ height: insets.bottom + 16 }} />
      </Animated.View>
    </View>
  );
}
