import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { DietIcon, PlusIcon } from '@/components/icons';
import { PressScale } from '@/components/press-scale';
import { MEAL_TYPES } from '@/shared';
import { useHaloTheme } from '@/theme/theme-provider';

import { deleteMeal, type Item, ItemRow, type Meal, TYPE_LABELS, useMealEditor } from './editor';
import { emitMealLogged } from './events';

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const PAD = 20;
const THUMB = 64;
const THUMB_RADIUS = 18;
/** Muted red for Reject: present but quiet, in keeping with the calm palette. */
const REJECT_RED = '#E0857B';
const ACTIONS_INSET = 12;
/** Room under the rows so the last one can scroll clear of the floating actions. */
const ACTIONS_CLEARANCE = 60 + ACTIONS_INSET * 2;

type Props = {
  meal: Meal;
  items: Item[];
  /** The card's size, for the photo's flight from full card to thumbnail. */
  size: { width: number; height: number };
  radius: number;
  /** What the logged meal moved ("Protein is on track"), shown under the check. */
  reaction?: string | null;
  /** Called once the Log or Reject animation has finished. */
  onDone: () => void;
};

type Phase = 'editing' | 'logged' | 'rejecting';

/**
 * The analysis, in the card where the camera was: the photo shrinks to a thumbnail at the top,
 * then the title, meal type, totals and editable rows fade in. Log draws a check (a small,
 * warm moment); Reject sinks the result away (quick and neutral). Then the camera comes back.
 */
export function ResultSection({ meal, items, size, radius, reaction, onDone }: Props) {
  const { theme } = useHaloTheme();
  const reduced = useReducedMotion();
  const editor = useMealEditor(meal, items);
  const [phase, setPhase] = useState<Phase>('editing');

  // 0 = photo fills the card, 1 = photo is the thumbnail.
  const fly = useSharedValue(reduced || !meal.photoUri ? 1 : 0);
  const content = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    fly.set(withTiming(1, { duration: 550, easing: EASE_OUT }));
    content.set(withDelay(250, withTiming(1, { duration: 450, easing: EASE_OUT })));
  }, [reduced, fly, content]);

  const photoStyle = useAnimatedStyle(() => {
    const t = fly.get();
    return {
      left: interpolate(t, [0, 1], [0, PAD]),
      top: interpolate(t, [0, 1], [0, PAD]),
      width: interpolate(t, [0, 1], [size.width, THUMB]),
      height: interpolate(t, [0, 1], [size.height, THUMB]),
      borderRadius: interpolate(t, [0, 1], [radius, THUMB_RADIUS]),
      // Hand over to the thumbnail in the scrolling header once it has landed.
      opacity: t >= 1 ? 0 : 1,
    };
  });
  const contentStyle = useAnimatedStyle(() => ({
    opacity: content.get(),
    transform: [{ translateY: (1 - content.get()) * 10 }],
  }));

  const log = () => {
    editor.commit();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    emitMealLogged();
    setPhase('logged');
    content.set(withTiming(0, { duration: 200, easing: EASE_OUT }));
    // Long enough to read the reaction line that lands under the check.
    setTimeout(onDone, reduced ? 1200 : 1800);
  };

  const reject = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPhase('rejecting');
    content.set(withTiming(0, { duration: reduced ? 0 : 280, easing: EASE_OUT }));
    setTimeout(
      () => {
        onDone();
        deleteMeal(meal, items);
      },
      reduced ? 50 : 300,
    );
  };

  const sinkStyle = useAnimatedStyle(() =>
    phase === 'rejecting' ? { transform: [{ translateY: (1 - content.get()) * 28 }] } : {},
  );

  const { title, setTitle, mealType, setMealType, kept, totals, notice } = editor;

  return (
    <View
      className="flex-1 overflow-hidden border border-hairline/10 bg-surface"
      style={{ borderRadius: radius }}>
      <Animated.View style={[styles.fill, contentStyle, sinkStyle]}>
        <ScrollView
          style={styles.fill}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: PAD, paddingBottom: ACTIONS_CLEARANCE }}>
          <View className="flex-row items-center">
            <View
              className="items-center justify-center overflow-hidden bg-glass/10"
              style={{ width: THUMB, height: THUMB, borderRadius: THUMB_RADIUS }}>
              {meal.photoUri ? (
                <Image
                  source={{ uri: meal.photoUri }}
                  contentFit="cover"
                  style={{ width: THUMB, height: THUMB }}
                />
              ) : (
                <DietIcon size={24} color={theme.colors.text} />
              )}
            </View>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Meal"
              placeholderTextColor={theme.colors.muted}
              maxLength={80}
              multiline
              accessibilityLabel="Meal name"
              className="ml-4 flex-1 font-serif text-[26px] leading-[30px] text-text"
            />
          </View>

          <View className="mt-4 flex-row flex-wrap gap-2">
            {MEAL_TYPES.map((t) => (
              <Pressable
                key={t}
                accessibilityRole="radio"
                accessibilityState={{ selected: t === mealType }}
                onPress={() => setMealType(t)}
                className={`rounded-pill px-3 py-1.5 ${t === mealType ? 'bg-text' : 'bg-glass/10'}`}>
                <Text
                  className={`font-sans-medium text-[13px] ${t === mealType ? 'text-bg' : 'text-text'}`}>
                  {TYPE_LABELS[t]}
                </Text>
              </Pressable>
            ))}
          </View>

          {notice ? <Text className="mt-3 font-sans text-[14px] text-accent">{notice}</Text> : null}

          <View className="mt-4 flex-row items-baseline">
            <Text className="font-serif text-[40px] leading-[44px] text-text">
              {Math.round(totals.kcal)}
            </Text>
            <Text className="ml-1.5 font-sans text-[15px] text-muted">kcal</Text>
            <Text className="ml-auto font-sans text-[13px] text-muted">
              P {Math.round(totals.proteinG)} · C {Math.round(totals.carbsG)} · F{' '}
              {Math.round(totals.fatG)} g
            </Text>
          </View>

          <View className="mt-3 gap-3">
            {editor.rows.map((r) => (
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
            className="mt-2 flex-row items-center self-start rounded-pill px-3 py-2 active:bg-glass/10">
            <PlusIcon size={18} color={theme.colors.text} />
            <Text className="ml-1.5 font-sans-medium text-[14px] text-text">Add item</Text>
          </Pressable>
        </ScrollView>

        {/* Floating actions over the scrolling rows: Log first, Reject as quiet red text. */}
        <View
          pointerEvents="box-none"
          style={styles.actions}
          className="flex-row items-center rounded-pill border border-hairline/15 bg-surface p-1.5">
          <PressScale
            accessibilityRole="button"
            accessibilityLabel="Log"
            accessibilityState={{ disabled: kept.length === 0 }}
            disabled={phase !== 'editing' || kept.length === 0}
            onPress={log}
            pressableStyle={styles.fill}
            className={`h-12 items-center justify-center rounded-pill bg-text ${kept.length === 0 ? 'opacity-40' : ''}`}>
            <Text className="font-sans-medium text-[16px] text-bg">Log</Text>
          </PressScale>
          <PressScale
            accessibilityRole="button"
            accessibilityLabel="Reject"
            disabled={phase !== 'editing'}
            onPress={reject}
            className="h-12 items-center justify-center px-7">
            <Text className="font-sans-medium text-[16px]" style={{ color: REJECT_RED }}>
              Reject
            </Text>
          </PressScale>
        </View>
      </Animated.View>

      {meal.photoUri && !reduced ? (
        <Animated.View pointerEvents="none" style={[styles.flyer, photoStyle]}>
          <Image source={{ uri: meal.photoUri }} contentFit="cover" style={styles.fill} />
        </Animated.View>
      ) : null}

      {phase === 'logged' ? <LoggedCheck reaction={reaction ?? null} /> : null}
    </View>
  );
}

const RING = 40;
const CIRCUMFERENCE = 2 * Math.PI * RING;
const CHECK_LENGTH = 46;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

/** Log's moment: a ring draws around a check, "Logged" beneath, then the reaction line. */
function LoggedCheck({ reaction }: { reaction: string | null }) {
  const { theme } = useHaloTheme();
  const reduced = useReducedMotion();
  const ring = useSharedValue(reduced ? 1 : 0);
  const check = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    ring.set(withTiming(1, { duration: 550, easing: EASE_OUT }));
    check.set(withDelay(300, withTiming(1, { duration: 320, easing: EASE_OUT })));
  }, [reduced, ring, check]);
  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRCUMFERENCE * (1 - ring.get()),
  }));
  const checkProps = useAnimatedProps(() => ({
    strokeDashoffset: CHECK_LENGTH * (1 - check.get()),
  }));
  const c = RING + 4;
  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      accessibilityLiveRegion="polite"
      accessibilityLabel="Meal logged"
      style={StyleSheet.absoluteFill}
      className="items-center justify-center">
      <Svg width={c * 2} height={c * 2}>
        <AnimatedCircle
          cx={c}
          cy={c}
          r={RING}
          stroke={theme.colors.arc}
          strokeWidth={4}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={[CIRCUMFERENCE, CIRCUMFERENCE]}
          transform={`rotate(-90 ${c} ${c})`}
          animatedProps={ringProps}
        />
        <AnimatedPath
          d={`M ${c - 14} ${c + 1} l 10 10 l 19 -21`}
          stroke={theme.colors.arc}
          strokeWidth={4}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={[CHECK_LENGTH, CHECK_LENGTH]}
          animatedProps={checkProps}
        />
      </Svg>
      <Text className="mt-4 font-serif text-[28px] text-text">Logged</Text>
      {reaction ? (
        <Animated.Text
          entering={FadeIn.duration(350)}
          className="mt-2 px-8 text-center font-sans text-[15px] text-muted">
          {reaction}
        </Animated.Text>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flyer: { position: 'absolute', overflow: 'hidden' },
  actions: {
    position: 'absolute',
    left: ACTIONS_INSET,
    right: ACTIONS_INSET,
    bottom: ACTIONS_INSET,
  },
});
