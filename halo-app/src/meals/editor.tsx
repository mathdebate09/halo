// Editing a meal's analysis: rows (name, portion, kcal and macros) as strings while typing, live
// totals, meal type and title, and the write that turns it into a logged meal. Shared by the
// logger's result section and the edit sheet (History).

import { File } from 'expo-file-system';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { CloseIcon } from '@/components/icons';
import { deleteRecord, upsertRecord } from '@/db/mutate';
import type { MealType, mealItems, meals } from '@/db/schema';
import { useHaloTheme } from '@/theme/theme-provider';

import { patchMeal } from './analysis';

export const LOW_CONFIDENCE = 0.5;
export const TYPE_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

export type Meal = typeof meals.$inferSelect;
export type Item = typeof mealItems.$inferSelect;
export type Row = {
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
export const blankRow = (): Row => ({
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

/**
 * Editable state for one meal. It takes the analysis in once it's there, and again after a
 * re-analysis (analysing → draft); edits are never overwritten otherwise.
 */
export function useMealEditor(meal: Meal | undefined, items: Item[]) {
  const [rows, setRows] = useState<Row[]>([]);
  const [title, setTitle] = useState('');
  const [mealType, setMealType] = useState<MealType>('snack');
  const initialized = useRef(false);

  useEffect(() => {
    if (!meal) return;
    if (meal.status === 'analysing') {
      initialized.current = false;
      setMealType(meal.mealType);
      return;
    }
    if (initialized.current) return;
    initialized.current = true;
    setRows(items.length ? items.map(toRow) : [blankRow()]);
    setTitle(meal.title ?? '');
    setMealType(meal.mealType);
  }, [meal, items]);

  const kept = rows.filter((r) => r.name.trim());
  const totals = {
    kcal: kept.reduce((a, r) => a + num(r.kcal), 0),
    proteinG: kept.reduce((a, r) => a + num(r.proteinG), 0),
    carbsG: kept.reduce((a, r) => a + num(r.carbsG), 0),
    fatG: kept.reduce((a, r) => a + num(r.fatG), 0),
  };

  const notice =
    !meal || meal.status === 'analysing'
      ? null
      : meal.status === 'failed'
        ? 'Couldn’t analyse this one. Add what you had.'
        : !items.length && meal.status === 'draft'
          ? 'No food spotted. Add what you had.'
          : (meal.confidence ?? 1) < LOW_CONFIDENCE
            ? 'Rough estimate. Check the amounts.'
            : null;

  return {
    rows,
    title,
    setTitle,
    mealType,
    setMealType,
    kept,
    totals,
    notice,
    update: (key: string, patch: Partial<Row>) =>
      setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r))),
    addRow: () => setRows((rs) => [...rs, blankRow()]),
    removeRow: (key: string) => setRows((rs) => rs.filter((x) => x.key !== key)),
    /** Skip the wait: stops a late result from landing and starts a blank row. */
    enterManually: () => {
      if (!meal) return;
      initialized.current = true;
      setRows([blankRow()]);
      patchMeal(meal, { status: 'draft' });
    },
    /** Writes the rows and logs the meal. */
    commit: () => {
      if (!meal) return;
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
    },
  };
}

/** Deletes a meal, its items and its local photo (no undo: callers confirm or animate first). */
export function deleteMeal(meal: Meal, items: Item[]) {
  for (const i of items) deleteRecord('mealItem', i.id);
  deleteRecord('meal', meal.id);
  if (meal.photoUri) {
    try {
      new File(meal.photoUri).delete();
    } catch {
      // Already gone.
    }
  }
}

export function ItemRow({
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
