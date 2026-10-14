import { and, desc, eq, isNull, lte } from 'drizzle-orm';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { Easing, FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton, QuietButton } from '@/components/button';
import { ChevronLeftIcon, ChevronRightIcon } from '@/components/icons';
import { showToast } from '@/components/toast';
import { WeightInput } from '@/components/weight-input';
import { db } from '@/db/client';
import { deleteRecord, upsertRecord } from '@/db/mutate';
import { weights } from '@/db/schema';
import { useProfile } from '@/lib/plan';
import { useUnits } from '@/lib/units';
import { addDays, clamp, dayKey, dayStart, displayWeight, round, WEIGHT_RANGE_KG } from '@/shared';
import { useHaloTheme } from '@/theme/theme-provider';

// The weigh-in sheet (SPEC "Ruler inputs"): a date stepper for back-filling, the weight dial,
// Update, and Delete for an existing entry. Opened from the plus button (and later Vitals).

const BACKFILL_DAYS = 30;
const EASE_SHEET = Easing.bezier(0.32, 0.72, 0, 1);

function dayLabel(day: string, today: string) {
  if (day === today) return 'Today';
  if (day === addDays(today, -1)) return 'Yesterday';
  return dayStart(day, 12).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export default function WeighInSheet() {
  const insets = useSafeAreaInsets();
  const { theme } = useHaloTheme();
  const profile = useProfile();
  const today = dayKey(new Date());
  const [day, setDay] = useState(today);

  // The entry for the chosen day, and the latest one up to it (the dial's starting point). Read
  // synchronously (local SQLite, one row each) so the sheet mounts complete, at the right value.
  const existing = db
    .select()
    .from(weights)
    .where(and(eq(weights.day, day), isNull(weights.deletedAt)))
    .orderBy(desc(weights.at))
    .limit(1)
    .get();
  const before = db
    .select({ kg: weights.kg })
    .from(weights)
    .where(and(lte(weights.day, day), isNull(weights.deletedAt)))
    .orderBy(desc(weights.day), desc(weights.at))
    .limit(1)
    .get();
  const startKg = clamp(
    existing?.kg ?? before?.kg ?? profile?.weightKg ?? 70,
    WEIGHT_RANGE_KG.min,
    WEIGHT_RANGE_KG.max,
  );

  const canBack = day > addDays(today, -BACKFILL_DAYS);
  const canForward = day < today;

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

        <View className="flex-row items-center justify-between px-4">
          <Stepper
            label="Previous day"
            disabled={!canBack}
            onPress={() => setDay(addDays(day, -1))}
            Icon={ChevronLeftIcon}
            color={theme.colors.text}
          />
          <Text className="font-sans-medium text-[17px] text-text" accessibilityRole="header">
            {dayLabel(day, today)}
          </Text>
          <Stepper
            label="Next day"
            disabled={!canForward}
            onPress={() => setDay(addDays(day, 1))}
            Icon={ChevronRightIcon}
            color={theme.colors.text}
          />
        </View>

        <DayEntry key={day} day={day} today={today} existing={existing} startKg={startKg} />
        {/* A plain View: NativeWind drops `style` on an Animated.View that also has className. */}
        <View style={{ height: insets.bottom + 16 }} />
      </Animated.View>
    </View>
  );
}

type Weight = typeof weights.$inferSelect;

/** The dial and actions for one day; remounted per day so it always starts at that day's value. */
function DayEntry({
  day,
  today,
  existing,
  startKg,
}: {
  day: string;
  today: string;
  existing: Weight | undefined;
  startKg: number;
}) {
  const [units] = useUnits();
  const [kg, setKg] = useState(startKg);

  const save = () => {
    const at = existing?.at ?? (day === today ? Date.now() : dayStart(day, 8).getTime());
    upsertRecord('weight', { id: existing?.id, day, at, kg: round(kg, 1), source: 'manual' });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
    showToast('Weight saved');
  };

  const remove = () => {
    if (!existing) return;
    const { id, day: d, at, kg: oldKg, source } = existing;
    deleteRecord('weight', id);
    router.back();
    showToast('Weight deleted', {
      label: 'Undo',
      onPress: () => upsertRecord('weight', { id, day: d, at, kg: oldKg, source }),
    });
  };

  const display = displayWeight(kg, units.weight);
  return (
    <>
      <View className="mt-6">
        <WeightInput kg={kg} onChangeKg={setKg} />
      </View>
      <View className="mt-8 px-6">
        <PrimaryButton label={`Update ${display.toFixed(1)} ${units.weight}`} onPress={save} />
        {existing ? <QuietButton label="Delete" onPress={remove} /> : null}
      </View>
    </>
  );
}

function Stepper({
  label,
  disabled,
  onPress,
  Icon,
  color,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
  Icon: typeof ChevronLeftIcon;
  color: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      className={`h-11 w-11 items-center justify-center rounded-full active:bg-glass/10 ${disabled ? 'opacity-25' : ''}`}>
      <Icon size={22} color={color} />
    </Pressable>
  );
}
