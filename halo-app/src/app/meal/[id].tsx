import { and, asc, eq, isNull } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { File } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { Easing, FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton, QuietButton } from '@/components/button';
import { CloseIcon, PlusIcon } from '@/components/icons';
import { showToast } from '@/components/toast';
import { db } from '@/db/client';
import { deleteRecord, upsertRecord } from '@/db/mutate';
import { type MealType, mealItems, meals } from '@/db/schema';
import { patchMeal, requestAnalysis, retryAnalysis } from '@/meals/analysis';
import { emitMealLogged } from '@/meals/events';
import { MEAL_TYPES } from '@/shared';
import { useHaloTheme } from '@/theme/theme-provider';

// The confirm sheet (SPEC "Plus button"): the analysis as editable rows (name, portion, kcal and
// macros), live totals, meal type, then Log meal. Also the manual path when the analysis failed,
// found no food, or the user doesn't want to wait.

const EASE_SHEET = Easing.bezier(0.32, 0.72, 0, 1);
const LOW_CONFIDENCE = 0.5;
const TYPE_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

type Item = typeof mealItems.$inferSelect;
type Row = {
  key: string;
  id?: string;
  name: string;
  portion: string;
  kcal: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
  grams: number | null;
  confidence: number | null;
};

let rowKey = 0;
const fmt = (n: number | null | undefined) => (n == null ? '' : String(Math.round(n * 10) / 10));
const toRow = (i: Item): Row => ({
  key: `r${rowKey++}`,
  id: i.id,
  name: i.name,
  portion: i.portion ?? '',
  kcal: fmt(i.kcal),
  proteinG: fmt(i.proteinG),
  carbsG: fmt(i.carbsG),
  fatG: fmt(i.fatG),
  grams: i.grams,
  confidence: i.confidence,
});
const blankRow = (): Row => ({
  key: `r${rowKey++}`,
  name: '',
  portion: '',
  kcal: '',
  proteinG: '',
  carbsG: '',
  fatG: '',
  grams: null,
  confidence: null,
});
const num = (s: string) => {
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

export default function MealSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { theme } = useHaloTheme();

  const { data: mealRows } = useLiveQuery(
    db
      .select()
      .from(meals)
      .where(and(eq(meals.id, id), isNull(meals.deletedAt))),
    [id],
  );
  const { data: items } = useLiveQuery(
    db
      .select()
      .from(mealItems)
      .where(and(eq(mealItems.mealId, id), isNull(mealItems.deletedAt)))
      .orderBy(asc(mealItems.createdAt)),
    [id],
  );
  const meal = mealRows[0];

  const [rows, setRows] = useState<Row[]>([]);
  const [title, setTitle] = useState('');
  const [mealType, setMealType] = useState<MealType>('snack');
  const initialized = useRef(false);

  // Take the analysis into editable state once it's there (and never overwrite edits after).
  useEffect(() => {
    if (!meal || initialized.current || meal.status === 'analysing') return;
    initialized.current = true;
    setRows(items.length ? items.map(toRow) : [blankRow()]);
    setTitle(meal.title ?? '');
    setMealType(meal.mealType);
  }, [meal, items]);
  useEffect(() => {
    if (meal && !initialized.current) setMealType(meal.mealType);
  }, [meal]);

  if (!meal) return <Backdrop />;

  const analysing = meal.status === 'analysing';
  const kept = rows.filter((r) => r.name.trim());
  const totals = {
    kcal: kept.reduce((a, r) => a + num(r.kcal), 0),
    proteinG: kept.reduce((a, r) => a + num(r.proteinG), 0),
    carbsG: kept.reduce((a, r) => a + num(r.carbsG), 0),
    fatG: kept.reduce((a, r) => a + num(r.fatG), 0),
  };

  const note = analysing
    ? null
    : meal.status === 'failed'
      ? 'Couldn’t analyse this one. Add what you had.'
      : !items.length && meal.status === 'draft'
        ? 'No food spotted. Add what you had.'
        : (meal.confidence ?? 1) < LOW_CONFIDENCE
          ? 'Rough estimate. Check the amounts.'
          : null;

  const update = (key: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const enterManually = () => {
    patchMeal(meal, { status: 'draft' }); // stops the runner from applying a late result
    initialized.current = true;
    setRows([blankRow()]);
  };

  const log = () => {
    const keepIds = new Set(kept.map((r) => r.id).filter(Boolean));
    for (const old of items) if (!keepIds.has(old.id)) deleteRecord('mealItem', old.id);
    for (const r of kept) {
      upsertRecord('mealItem', {
        id: r.id,
        mealId: meal.id,
        name: r.name.trim(),
        portion: r.portion.trim() || null,
        grams: r.grams,
        kcal: num(r.kcal),
        proteinG: num(r.proteinG),
        carbsG: num(r.carbsG),
        fatG: num(r.fatG),
        confidence: r.confidence,
      });
    }
    patchMeal(meal, {
      status: 'logged',
      title: title.trim() || kept[0]?.name.trim() || null,
      mealType,
      ...totals,
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
    emitMealLogged();
  };

  const remove = () => {
    const snapshot = { meal, items };
    for (const i of items) deleteRecord('mealItem', i.id);
    deleteRecord('meal', meal.id);
    router.back();
    let undone = false;
    showToast('Meal deleted', {
      label: 'Undo',
      onPress: () => {
        undone = true;
        const { createdAt: _c, updatedAt: _u, deletedAt: _d, syncState: _s, ...m } = snapshot.meal;
        upsertRecord('meal', m);
        for (const i of snapshot.items) {
          const { createdAt: _ic, updatedAt: _iu, deletedAt: _id, syncState: _is, ...fields } = i;
          upsertRecord('mealItem', fields);
        }
        if (m.status === 'analysing') requestAnalysis();
      },
    });
    // The photo goes once the undo window has passed.
    setTimeout(() => {
      if (undone || !snapshot.meal.photoUri) return;
      try {
        new File(snapshot.meal.photoUri).delete();
      } catch {
        // Already gone.
      }
    }, 5000);
  };

  return (
    <KeyboardAvoidingView behavior="padding" className="flex-1 justify-end">
      <Backdrop />
      <Animated.View
        accessibilityViewIsModal
        entering={SlideInDown.duration(400).easing(EASE_SHEET)}
        className="rounded-t-card border-x border-t border-hairline/10 bg-surface"
        style={{ maxHeight: height * 0.9 }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="px-5 pt-3"
          showsVerticalScrollIndicator={false}>
          <View className="mb-3 h-1 w-10 self-center rounded-pill bg-glass/20" />

          <View className="flex-row items-center">
            {meal.photoUri ? (
              <Image
                source={{ uri: meal.photoUri }}
                contentFit="cover"
                style={{ width: 56, height: 56, borderRadius: 18 }}
              />
            ) : null}
            <TextInput
              value={analysing ? '' : title}
              onChangeText={setTitle}
              editable={!analysing}
              placeholder={analysing ? 'Analysing…' : 'Meal'}
              placeholderTextColor={theme.colors.muted}
              maxLength={80}
              accessibilityLabel="Meal name"
              className={`flex-1 font-serif text-[30px] leading-[36px] text-text ${meal.photoUri ? 'ml-4' : ''}`}
            />
          </View>

          <View className="mt-4 flex-row gap-2">
            {MEAL_TYPES.map((t) => (
              <Pressable
                key={t}
                accessibilityRole="radio"
                accessibilityState={{ selected: t === mealType }}
                onPress={() => setMealType(t)}
                className={`rounded-pill px-3.5 py-2 ${t === mealType ? 'bg-text' : 'bg-glass/10'}`}>
                <Text
                  className={`font-sans-medium text-[13px] ${t === mealType ? 'text-bg' : 'text-text'}`}>
                  {TYPE_LABELS[t]}
                </Text>
              </Pressable>
            ))}
          </View>

          {analysing ? (
            <Animated.View entering={FadeIn.duration(400)} className="mt-8 items-center">
              <Text className="font-sans text-[15px] text-muted">
                Working out what’s on the plate…
              </Text>
              <QuietButton label="Enter it myself" onPress={enterManually} />
            </Animated.View>
          ) : (
            <>
              {note ? <Text className="mt-4 font-sans text-[14px] text-accent">{note}</Text> : null}

              <View className="mt-5 flex-row items-baseline">
                <Text className="font-serif text-[44px] leading-[48px] text-text">
                  {Math.round(totals.kcal)}
                </Text>
                <Text className="ml-1.5 font-sans text-[15px] text-muted">kcal</Text>
                <Text className="ml-auto font-sans text-[14px] text-muted">
                  P {Math.round(totals.proteinG)} · C {Math.round(totals.carbsG)} · F{' '}
                  {Math.round(totals.fatG)} g
                </Text>
              </View>

              <View className="mt-4 gap-3">
                {rows.map((r) => (
                  <ItemRow
                    key={r.key}
                    row={r}
                    onChange={(patch) => update(r.key, patch)}
                    onRemove={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                  />
                ))}
              </View>

              <Pressable
                accessibilityRole="button"
                onPress={() => setRows((rs) => [...rs, blankRow()])}
                className="mt-3 flex-row items-center self-start rounded-pill px-3 py-2 active:bg-glass/10">
                <PlusIcon size={18} color={theme.colors.text} />
                <Text className="ml-1.5 font-sans-medium text-[14px] text-text">Add item</Text>
              </Pressable>

              {meal.status === 'failed' && (meal.photoUri || meal.note) ? (
                <QuietButton
                  label="Try the analysis again"
                  onPress={() => retryAnalysis(meal.id)}
                />
              ) : null}
            </>
          )}

          <View className="mt-6">
            <PrimaryButton
              label="Log meal"
              disabled={analysing || kept.length === 0}
              onPress={log}
            />
            <QuietButton label="Delete meal" onPress={remove} />
          </View>
          <View style={{ height: insets.bottom + 12 }} />
        </ScrollView>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

function Backdrop() {
  return (
    <Animated.View entering={FadeIn.duration(300)} className="absolute inset-0">
      <Pressable
        accessibilityLabel="Close"
        onPress={() => router.back()}
        className="flex-1 bg-veil/60"
      />
    </Animated.View>
  );
}

function ItemRow({
  row,
  onChange,
  onRemove,
}: {
  row: Row;
  onChange: (patch: Partial<Row>) => void;
  onRemove: () => void;
}) {
  const { theme } = useHaloTheme();
  const field = (key: 'kcal' | 'proteinG' | 'carbsG' | 'fatG', label: string) => (
    <View className="flex-1 items-center rounded-2xl bg-glass/10 py-1.5">
      <TextInput
        value={row[key]}
        onChangeText={(t) => onChange({ [key]: t.replace(/[^0-9.,]/g, '') })}
        keyboardType="decimal-pad"
        maxLength={6}
        accessibilityLabel={`${row.name || 'Item'} ${label}`}
        className="w-full p-0 text-center font-sans-medium text-[16px] text-text"
      />
      <Text className="font-sans text-[11px] text-muted">{label}</Text>
    </View>
  );
  return (
    <View className="rounded-[22px] border border-hairline/10 p-3">
      <View className="flex-row items-center">
        <View className="flex-1">
          <TextInput
            value={row.name}
            onChangeText={(name) => onChange({ name })}
            placeholder="Food"
            placeholderTextColor={theme.colors.muted}
            maxLength={80}
            accessibilityLabel="Food name"
            className="p-0 font-sans-medium text-[16px] text-text"
          />
          <TextInput
            value={row.portion}
            onChangeText={(portion) => onChange({ portion })}
            placeholder="Portion"
            placeholderTextColor={theme.colors.muted}
            maxLength={60}
            accessibilityLabel="Portion"
            className="mt-0.5 p-0 font-sans text-[13px] text-muted"
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove ${row.name || 'item'}`}
          onPress={onRemove}
          hitSlop={8}
          className="h-9 w-9 items-center justify-center rounded-full active:bg-glass/10">
          <CloseIcon size={16} color={theme.colors.muted} />
        </Pressable>
      </View>
      <View className="mt-2.5 flex-row gap-2">
        {field('kcal', 'kcal')}
        {field('proteinG', 'protein')}
        {field('carbsG', 'carbs')}
        {field('fatG', 'fat')}
      </View>
    </View>
  );
}
