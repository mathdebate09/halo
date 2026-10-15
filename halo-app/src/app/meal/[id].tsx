import { and, asc, eq, isNull } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { File } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
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
import { PlusIcon } from '@/components/icons';
import { showToast } from '@/components/toast';
import { db } from '@/db/client';
import { deleteRecord, upsertRecord } from '@/db/mutate';
import { mealItems, meals } from '@/db/schema';
import { requestAnalysis, retryAnalysis } from '@/meals/analysis';
import { ItemRow, TYPE_LABELS, useMealEditor } from '@/meals/editor';
import { emitMealLogged } from '@/meals/events';
import { MEAL_TYPES } from '@/shared';
import { useHaloTheme } from '@/theme/theme-provider';

// The confirm sheet (SPEC "Plus button"): the analysis as editable rows (name, portion, kcal and
// macros), live totals, meal type, then Log meal. Also the manual path when the analysis failed,
// found no food, or the user doesn't want to wait.

const EASE_SHEET = Easing.bezier(0.32, 0.72, 0, 1);
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

  const editor = useMealEditor(meal, items);
  const { rows, title, setTitle, mealType, setMealType, kept, totals, notice: note } = editor;

  // The panel mounts only once its rows are in: a SlideInDown panel that grows after it starts
  // entering keeps its first offset and sits partly below the screen.
  if (!meal || (meal.status !== 'analysing' && rows.length === 0)) return <Backdrop />;

  const analysing = meal.status === 'analysing';

  const log = () => {
    editor.commit();
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
        className="rounded-t-card border-x border-t border-hairline/10 bg-surface">
        {/* A plain View holds the height cap: NativeWind drops `style` on an Animated.View that
            also has className, which let the sheet grow past the screen. */}
        <View style={{ maxHeight: height * 0.9 }}>
          <ScrollView
            style={{ flexGrow: 0, flexShrink: 1 }}
            keyboardShouldPersistTaps="handled"
            contentContainerClassName="px-5 pt-3 pb-4"
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
                <QuietButton label="Enter it myself" onPress={editor.enterManually} />
              </Animated.View>
            ) : (
              <>
                {note ? (
                  <Text className="mt-4 font-sans text-[14px] text-accent">{note}</Text>
                ) : null}

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
                      onChange={(patch) => editor.update(r.key, patch)}
                      onRemove={() => editor.removeRow(r.key)}
                    />
                  ))}
                </View>

                <Pressable
                  accessibilityRole="button"
                  onPress={editor.addRow}
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
          </ScrollView>

          {/* Pinned under the scrolling content, so the actions are always on screen. */}
          <View className="border-t border-hairline/10 px-5 pt-3">
            <PrimaryButton
              label="Log meal"
              disabled={analysing || kept.length === 0}
              onPress={log}
            />
            <QuietButton label="Delete meal" onPress={remove} />
            <View style={{ height: insets.bottom + 4 }} />
          </View>
        </View>
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
