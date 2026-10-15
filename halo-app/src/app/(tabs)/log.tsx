import { and, asc, desc, eq, gte, inArray, isNull } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { type ComponentType, useEffect, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  ArrowUpIcon,
  ChatIcon,
  CloseIcon,
  HistoryIcon,
  RunIcon,
  ScaleIcon,
  WaterIcon,
} from '@/components/icons';
import { PressScale } from '@/components/press-scale';
import { Sheet } from '@/components/sheet';
import { setToastLift } from '@/components/toast';
import { ThemedScreen } from '@/components/themed-screen';
import { db } from '@/db/client';
import { mealItems, meals } from '@/db/schema';
import { addWater, DEFAULT_GLASS_ML } from '@/lib/water';
import { reanalyse } from '@/meals/analysis';
import { saveMeal } from '@/meals/capture';
import { MealCamera } from '@/meals/meal-camera';
import { ResultSection } from '@/meals/result-section';
import { ScanLoader } from '@/meals/scan-loader';
import { useHaloTheme } from '@/theme/theme-provider';
import { useMealReaction } from '@/today/celebration';
import { useTodayScores } from '@/today/today-scores';
import { tierGradients } from '@/theme/themes';

// The Meal Logger section (the dock's plus). One card does the whole flow in place: the camera,
// then the sent photo under the AI loader, then the analysis as an editable section with Log and
// Reject, then the camera again. The note bar below follows along: a note, "Analysing…", then a
// correction that re-runs the analysis.

const CARD_RADIUS = 44;
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const WATER_PRESETS = [150, 250, 330, 500];
/** A pending meal this recent is picked back up when the logger opens. */
const RESUME_WITHIN_MS = 12 * 3600 * 1000;

type Mode = 'capture' | 'analysing' | 'result';

export default function MealLogger() {
  const insets = useSafeAreaInsets();
  const { theme } = useHaloTheme();
  const focused = useIsFocused();
  const params = useLocalSearchParams<{ meal?: string }>();
  const { reaction, reset: resetReaction } = useMealReaction(useTodayScores());

  const [activeId, setActiveId] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [capture, setCapture] = useState(0); // remounts the camera after each round
  const [card, setCard] = useState({ width: 0, height: 0 });
  const [waterSheet, setWaterSheet] = useState(false);
  const [customMl, setCustomMl] = useState('');

  const { data: activeRows } = useLiveQuery(
    db
      .select()
      .from(meals)
      .where(and(eq(meals.id, activeId ?? ''), isNull(meals.deletedAt))),
    [activeId],
  );
  const { data: items } = useLiveQuery(
    db
      .select()
      .from(mealItems)
      .where(and(eq(mealItems.mealId, activeId ?? ''), isNull(mealItems.deletedAt)))
      .orderBy(asc(mealItems.createdAt)),
    [activeId],
  );
  const meal = activeId ? activeRows[0] : undefined;
  const mode: Mode = !meal ? 'capture' : meal.status === 'analysing' ? 'analysing' : 'result';

  // Leaving the logger resets the camera card to its blurred "Meal Logger" face: coming back
  // asks for a tap again instead of opening straight into a live viewfinder. A photo already
  // taken (not yet sent) stays.
  useEffect(() => {
    if (!focused) setCapture((c) => c + 1);
  }, [focused]);

  // Toasts (the reaction after Log) float above the action row while the logger is open.
  useEffect(() => {
    setToastLift('logger', focused ? 84 : 0);
    return () => setToastLift('logger', 0);
  }, [focused]);

  // Opened from Today's card: show that meal in the card.
  useEffect(() => {
    if (!params.meal) return;
    setActiveId(params.meal);
    router.setParams({ meal: undefined });
  }, [params.meal]);

  // Coming back to the logger with a meal still in flight (or waiting for review): resume it.
  useEffect(() => {
    if (!focused || activeId) return;
    const pending = db
      .select({ id: meals.id })
      .from(meals)
      .where(
        and(
          inArray(meals.status, ['analysing', 'draft', 'failed']),
          isNull(meals.deletedAt),
          gte(meals.createdAt, Date.now() - RESUME_WITHIN_MS),
        ),
      )
      .orderBy(desc(meals.createdAt))
      .limit(1)
      .get();
    if (pending) setActiveId(pending.id);
  }, [focused, activeId]);

  const canSend = mode === 'capture' ? !!photo || note.trim().length > 0 : note.trim().length > 0;

  const send = () => {
    if (!canSend) return;
    Keyboard.dismiss();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (mode === 'result' && meal) {
      reanalyse(meal.id, note);
    } else {
      const saved = saveMeal({ photoUri: photo, note });
      setActiveId(saved.id);
      setPhoto(null);
    }
    setNote('');
  };

  const finish = () => {
    resetReaction();
    setActiveId(null);
    setCapture((c) => c + 1);
  };

  const custom = Number(customMl);
  const customValid = Number.isFinite(custom) && custom >= 50 && custom <= 2000;
  const addCustom = (ml: number) => {
    setWaterSheet(false);
    setCustomMl('');
    addWater(ml);
  };

  const [top, mid, bottom] = tierGradients[theme.tier];

  return (
    <ThemedScreen>
      <View
        className="flex-1 px-4"
        // On a plain View: KeyboardAvoidingView owns its own bottom padding.
        style={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }}>
        <View className="mb-3 flex-row justify-end">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close the logger"
            // Always home to Today, wherever the logger was opened from.
            onPress={() => router.navigate('/')}
            hitSlop={8}
            className="h-11 w-11 items-center justify-center rounded-full bg-glass/10 active:bg-glass/20">
            <CloseIcon size={22} color={theme.colors.text} />
          </Pressable>
        </View>
        <KeyboardAvoidingView behavior="padding" className="flex-1">
          <View
            className="flex-1"
            onLayout={(e) =>
              setCard({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })
            }>
            {mode === 'capture' ? (
              <Animated.View
                key={`cam${capture}`}
                entering={FadeIn.duration(450)}
                style={styles.fill}>
                <MealCamera active={focused} photo={photo} onPhoto={setPhoto} />
              </Animated.View>
            ) : null}

            {mode === 'analysing' && meal ? (
              <View
                className="flex-1 overflow-hidden border border-hairline/10"
                style={{ borderRadius: CARD_RADIUS }}>
                {meal.photoUri ? (
                  <Image
                    source={{ uri: meal.photoUri }}
                    contentFit="cover"
                    style={StyleSheet.absoluteFill}
                  />
                ) : (
                  <>
                    <LinearGradient colors={[top, mid, bottom]} style={StyleSheet.absoluteFill} />
                    <View className="flex-1 items-center justify-center px-8">
                      <Text
                        numberOfLines={5}
                        className="text-center font-serif text-[30px] leading-[36px] text-text">
                        “{meal.note}”
                      </Text>
                    </View>
                  </>
                )}
                <ScanLoader radius={CARD_RADIUS} />
              </View>
            ) : null}

            {mode === 'result' && meal && card.width > 0 ? (
              <ResultSection
                key={`${meal.id}:${meal.jobId ?? ''}`}
                meal={meal}
                items={items}
                size={card}
                radius={CARD_RADIUS}
                reaction={reaction}
                onDone={finish}
              />
            ) : null}
          </View>

          <NoteBar mode={mode} note={note} onChangeNote={setNote} canSend={canSend} onSend={send} />
        </KeyboardAvoidingView>

        <View className="mt-4 flex-row justify-between">
          <Action label="History" Icon={HistoryIcon} onPress={() => router.navigate('/history')} />
          <Action
            label="Water"
            Icon={WaterIcon}
            onPress={() => addWater()}
            onLongPress={() => setWaterSheet(true)}
          />
          <Action label="Weigh-in" Icon={ScaleIcon} onPress={() => router.push('/weigh-in')} />
          <Action label="Advisor" Icon={ChatIcon} onPress={() => router.push('/advisor')} />
          <Action
            label="Workout"
            Icon={RunIcon}
            onPress={() => router.navigate({ pathname: '/exercise', params: { tracker: '1' } })}
          />
        </View>
      </View>

      <Sheet
        visible={waterSheet}
        onClose={() => setWaterSheet(false)}
        accessibilityLabel="Add water">
        <Text className="font-serif text-[32px] text-text">Water</Text>
        <View className="mt-5 flex-row gap-2">
          {WATER_PRESETS.map((ml) => (
            <PressScale
              key={ml}
              accessibilityRole="button"
              onPress={() => addCustom(ml)}
              pressableStyle={styles.fill}
              className={`items-center rounded-pill py-3 ${ml === DEFAULT_GLASS_ML ? 'bg-glass/20' : 'bg-glass/10'}`}>
              <Text className="font-sans-medium text-[15px] text-text">{ml} ml</Text>
            </PressScale>
          ))}
        </View>
        <View className="mt-3 flex-row items-center rounded-pill border border-hairline/10 bg-glass/10 py-1.5 pl-5 pr-1.5">
          <TextInput
            value={customMl}
            onChangeText={(t) => setCustomMl(t.replace(/[^0-9]/g, ''))}
            placeholder="Other amount"
            placeholderTextColor={theme.colors.muted}
            keyboardType="number-pad"
            maxLength={4}
            className="flex-1 py-2 font-sans text-[16px] text-text"
            accessibilityLabel="Water in millilitres"
          />
          <Text className="mr-3 font-sans text-[15px] text-muted">ml</Text>
          <PressScale
            accessibilityRole="button"
            accessibilityLabel="Add"
            disabled={!customValid}
            onPress={() => addCustom(custom)}
            className={`rounded-pill bg-text px-5 py-2.5 ${customValid ? '' : 'opacity-30'}`}>
            <Text className="font-sans-medium text-[15px] text-bg">Add</Text>
          </PressScale>
        </View>
      </Sheet>
    </ThemedScreen>
  );
}

/**
 * The note bar under the card. While the AI works it converges into a small "Analysing" pill
 * (a layout transition), then opens back up as the place to ask for a correction.
 */
function NoteBar({
  mode,
  note,
  onChangeNote,
  canSend,
  onSend,
}: {
  mode: Mode;
  note: string;
  onChangeNote: (note: string) => void;
  canSend: boolean;
  onSend: () => void;
}) {
  const { theme } = useHaloTheme();
  const analysing = mode === 'analysing';
  return (
    <Animated.View
      layout={LinearTransition.duration(450).easing(EASE_OUT)}
      className={`mt-4 min-h-[56px] flex-row items-center rounded-[28px] border border-hairline/10 bg-glass/10 ${analysing ? 'self-center px-6' : 'self-stretch py-1.5 pl-5 pr-1.5'}`}>
      {analysing ? (
        <Animated.View
          key="analysing"
          entering={FadeIn.duration(300).delay(200)}
          exiting={FadeOut.duration(150)}
          accessibilityLiveRegion="polite"
          className="flex-row items-center">
          <Text className="font-sans-medium text-[16px] text-text">Analysing</Text>
          <WaveDots color={theme.colors.text} />
        </Animated.View>
      ) : (
        <Animated.View
          key="input"
          entering={FadeIn.duration(300).delay(200)}
          exiting={FadeOut.duration(150)}
          className="flex-1 flex-row items-end">
          <TextInput
            value={note}
            onChangeText={onChangeNote}
            placeholder={mode === 'result' ? 'Something off? Tell me what to fix' : 'Add a note'}
            placeholderTextColor={theme.colors.muted}
            multiline
            maxLength={280}
            className="max-h-24 flex-1 py-2.5 font-sans text-[16px] text-text"
            accessibilityLabel={mode === 'result' ? 'Correction for the analysis' : 'Meal note'}
          />
          <PressScale
            accessibilityRole="button"
            accessibilityLabel={mode === 'result' ? 'Re-analyse' : 'Analyse meal'}
            accessibilityState={{ disabled: !canSend }}
            disabled={!canSend}
            onPress={onSend}
            className={`h-11 w-11 items-center justify-center rounded-full bg-text ${canSend ? '' : 'opacity-30'}`}>
            <ArrowUpIcon size={22} color={theme.colors.bg} />
          </PressScale>
        </Animated.View>
      )}
    </Animated.View>
  );
}

/** Three dots rising and falling in a wave (still under reduced motion). */
function WaveDots({ color }: { color: string }) {
  return (
    <View className="ml-2 flex-row items-end gap-1" style={{ height: 14 }}>
      {[0, 1, 2].map((i) => (
        <WaveDot key={i} index={i} color={color} />
      ))}
    </View>
  );
}

function WaveDot({ index, color }: { index: number; color: string }) {
  const reduced = useReducedMotion();
  const y = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    y.set(
      withDelay(
        index * 140,
        withRepeat(
          withSequence(
            withTiming(-5, { duration: 320, easing: Easing.inOut(Easing.sin) }),
            withTiming(0, { duration: 320, easing: Easing.inOut(Easing.sin) }),
            withTiming(0, { duration: 260 }),
          ),
          -1,
        ),
      ),
    );
  }, [reduced, index, y]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));
  return (
    <Animated.View
      style={[{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: color }, style]}
    />
  );
}

function Action({
  label,
  Icon,
  onPress,
  onLongPress,
}: {
  label: string;
  Icon: ComponentType<{ size?: number; color: string }>;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const { theme } = useHaloTheme();
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={onLongPress ? 'Long-press for other amounts' : undefined}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      className="items-center">
      <View className="h-14 w-14 items-center justify-center rounded-full border border-hairline/10 bg-glass/10">
        <Icon size={24} color={theme.colors.text} />
      </View>
      <Text className="mt-1.5 font-sans text-[12px] text-text/85">{label}</Text>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
