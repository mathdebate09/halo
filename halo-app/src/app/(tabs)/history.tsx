import { and, count, desc, eq, isNull, sum } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { Easing, FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDockInset } from '@/components/dock';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DietIcon,
  HistoryIcon,
  WaterIcon,
} from '@/components/icons';
import { PressScale } from '@/components/press-scale';
import { ThemedScreen } from '@/components/themed-screen';
import { db } from '@/db/client';
import { meals, water } from '@/db/schema';
import { formatTime } from '@/lib/clock';
import { dayLabel } from '@/lib/day-label';
import { usePlan } from '@/lib/plan';
import { TYPE_LABELS } from '@/meals/editor';
import { addDays, dayKey } from '@/shared';
import { useHaloTheme } from '@/theme/theme-provider';

// The day's meal history (the logger's History button): ‹ day ›, the day's intake against the
// plan's targets as thin bars, one water line, then the meals newest first. Tap a meal to edit it.

const HISTORY_DAYS = 30;
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

type Meal = typeof meals.$inferSelect;

export default function History() {
  const insets = useSafeAreaInsets();
  const dockInset = useDockInset();
  const { theme } = useHaloTheme();
  const plan = usePlan();
  const today = dayKey(new Date());
  const [day, setDay] = useState(today);

  const { data: dayMeals } = useLiveQuery(
    db
      .select()
      .from(meals)
      .where(and(eq(meals.day, day), isNull(meals.deletedAt)))
      .orderBy(desc(meals.eatenAt)),
    [day],
  );
  const { data: waterRows } = useLiveQuery(
    db
      .select({ ml: sum(water.ml), n: count() })
      .from(water)
      .where(and(eq(water.day, day), isNull(water.deletedAt))),
    [day],
  );

  const logged = dayMeals.filter((m) => m.status === 'logged');
  const total = (key: 'kcal' | 'proteinG' | 'carbsG' | 'fatG') =>
    logged.reduce((a, m) => a + (m[key] ?? 0), 0);
  const waterMl = Number(waterRows[0]?.ml ?? 0);

  return (
    <ThemedScreen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="px-4"
        contentContainerStyle={{ paddingTop: insets.top + 4, paddingBottom: dockInset }}>
        {/* No back button: the dock is here, with the plus leading back to the logger. */}
        <View className="mt-2 flex-row items-center px-1">
          <HistoryIcon size={28} color={theme.colors.text} />
          <Text accessibilityRole="header" className="ml-3 font-serif text-[34px] text-text">
            History
          </Text>
        </View>

        <View className="mt-4 flex-row items-center justify-between">
          <Stepper
            label="Previous day"
            disabled={day <= addDays(today, -HISTORY_DAYS)}
            onPress={() => setDay(addDays(day, -1))}
            Icon={ChevronLeftIcon}
          />
          <Text className="font-sans-medium text-[17px] text-text">{dayLabel(day, today)}</Text>
          <Stepper
            label="Next day"
            disabled={day >= today}
            onPress={() => setDay(addDays(day, 1))}
            Icon={ChevronRightIcon}
          />
        </View>

        {/* A new day's figures fade in. */}
        <Animated.View key={day} entering={FadeIn.duration(300).easing(EASE_OUT)}>
          <View className="mt-4 rounded-[26px] border border-hairline/10 p-4">
            <Bar label="Calories" value={total('kcal')} target={plan?.targetKcal} unit="kcal" />
            <Bar label="Protein" value={total('proteinG')} target={plan?.proteinG} unit="g" />
            <Bar label="Carbs" value={total('carbsG')} target={plan?.carbsG} unit="g" />
            <Bar label="Fat" value={total('fatG')} target={plan?.fatG} unit="g" last />
          </View>

          <View className="mt-3 flex-row items-center rounded-[22px] border border-hairline/10 px-4 py-3">
            <WaterIcon size={20} color={theme.colors.text} />
            <Text className="ml-3 flex-1 font-sans text-[16px] text-text">Water</Text>
            <Text className="font-sans text-[15px] text-muted">
              {waterMl.toLocaleString()}
              {plan ? ` / ${plan.waterMl.toLocaleString()}` : ''} ml
            </Text>
          </View>

          <View className="mt-5 gap-2">
            {dayMeals.length === 0 ? (
              <Text className="py-8 text-center font-sans text-[15px] text-muted">
                No meals logged {day === today ? 'yet' : 'this day'}.
              </Text>
            ) : (
              dayMeals.map((m) => <MealRow key={m.id} meal={m} />)
            )}
          </View>
        </Animated.View>
      </ScrollView>
    </ThemedScreen>
  );
}

/** One intake line: value against target, with a thin bar (full at target, never past it). */
function Bar({
  label,
  value,
  target,
  unit,
  last,
}: {
  label: string;
  value: number;
  target?: number;
  unit: string;
  last?: boolean;
}) {
  const fraction = target ? Math.min(1, value / target) : 0;
  return (
    <View className={last ? '' : 'mb-3.5'}>
      <View className="flex-row items-baseline">
        <Text className="flex-1 font-sans text-[15px] text-text">{label}</Text>
        <Text className="font-sans text-[14px] text-muted">
          <Text className="font-sans-medium text-text">{Math.round(value).toLocaleString()}</Text>
          {target ? ` / ${Math.round(target).toLocaleString()}` : ''} {unit}
        </Text>
      </View>
      <View className="mt-1.5 h-1 overflow-hidden rounded-pill bg-glass/10">
        <View className="h-1 rounded-pill bg-text/80" style={{ width: `${fraction * 100}%` }} />
      </View>
    </View>
  );
}

function MealRow({ meal }: { meal: Meal }) {
  const { theme } = useHaloTheme();
  const time = formatTime(new Date(meal.eatenAt));
  const status =
    meal.status === 'analysing'
      ? 'Analysing…'
      : meal.status === 'draft'
        ? 'Ready to review'
        : meal.status === 'failed'
          ? 'Add the details'
          : null;
  const name = meal.title || meal.note || 'Meal';
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${status ?? `${Math.round(meal.kcal ?? 0)} kilocalories`}`}
      onPress={() => router.push({ pathname: '/meal/[id]', params: { id: meal.id } })}
      className="flex-row items-center rounded-[22px] border border-hairline/10 p-2.5 pr-4">
      <View className="h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-glass/10">
        {meal.photoUri ? (
          <Image
            source={{ uri: meal.photoUri }}
            contentFit="cover"
            style={{ width: 48, height: 48 }}
          />
        ) : (
          <DietIcon size={20} color={theme.colors.text} />
        )}
      </View>
      <View className="ml-3 flex-1">
        <Text numberOfLines={1} className="font-sans-medium text-[16px] text-text">
          {name}
        </Text>
        <Text className="mt-0.5 font-sans text-[13px] text-muted">
          {time} · {TYPE_LABELS[meal.mealType]}
        </Text>
      </View>
      {status ? (
        <Text className="font-sans-medium text-[13px] text-accent">{status}</Text>
      ) : (
        <Text className="font-sans-medium text-[16px] text-text">
          {Math.round(meal.kcal ?? 0)}
          <Text className="font-sans text-[13px] text-muted"> kcal</Text>
        </Text>
      )}
    </PressScale>
  );
}

function Stepper({
  label,
  disabled,
  onPress,
  Icon,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
  Icon: typeof ChevronLeftIcon;
}) {
  const { theme } = useHaloTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      className={`h-11 w-11 items-center justify-center rounded-full active:bg-glass/10 ${disabled ? 'opacity-25' : ''}`}>
      <Icon size={22} color={theme.colors.text} />
    </Pressable>
  );
}
