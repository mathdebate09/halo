import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { type ComponentType, useState } from 'react';
import { KeyboardAvoidingView, Pressable, Text, TextInput, View } from 'react-native';
import Animated, { Easing, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  ArrowUpIcon,
  ChatIcon,
  CloseIcon,
  RunIcon,
  ScaleIcon,
  WaterIcon,
} from '@/components/icons';
import { PressScale } from '@/components/press-scale';
import { Sheet } from '@/components/sheet';
import { addWater, DEFAULT_GLASS_ML } from '@/lib/water';
import { saveMeal } from '@/meals/capture';
import { MealCamera } from '@/meals/meal-camera';
import { useHaloTheme } from '@/theme/theme-provider';

// The plus button: the Meal Logger (photo, a note, or both) with quick actions underneath.

const rise = (i: number) =>
  FadeInDown.duration(500)
    .delay(60 + i * 70)
    .easing(Easing.bezier(0.23, 1, 0.32, 1));

const WATER_PRESETS = [150, 250, 330, 500];

export default function LogModal() {
  const insets = useSafeAreaInsets();
  const { theme } = useHaloTheme();
  const [photo, setPhoto] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [waterSheet, setWaterSheet] = useState(false);
  const [customMl, setCustomMl] = useState('');
  const canLog = !!photo || note.trim().length > 0;

  const logMeal = () => {
    if (!canLog) return;
    saveMeal({ photoUri: photo, note });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  const addCustom = (ml: number) => {
    setWaterSheet(false);
    setCustomMl('');
    addWater(ml);
  };
  const custom = Number(customMl);
  const customValid = Number.isFinite(custom) && custom >= 50 && custom <= 2000;

  return (
    <View
      className="flex-1 bg-bg"
      // On the root, not the KeyboardAvoidingView: it owns its own bottom padding.
      style={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }}>
      <View className="flex-row justify-end px-4">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={() => router.back()}
          hitSlop={8}
          className="h-11 w-11 items-center justify-center rounded-full bg-glass/10 active:bg-glass/20">
          <CloseIcon size={22} color={theme.colors.text} />
        </Pressable>
      </View>

      <KeyboardAvoidingView behavior="padding" className="flex-1 px-4">
        <Animated.View entering={rise(0)} className="mt-3 flex-1">
          <MealCamera photo={photo} onPhoto={setPhoto} />
        </Animated.View>

        <Animated.View
          entering={rise(1)}
          className="mt-4 flex-row items-end rounded-[28px] border border-hairline/10 bg-glass/10 py-1.5 pl-5 pr-1.5">
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Add a note"
            placeholderTextColor={theme.colors.muted}
            multiline
            maxLength={280}
            className="max-h-24 flex-1 py-2.5 font-sans text-[16px] text-text"
            accessibilityLabel="Meal note"
          />
          <PressScale
            accessibilityRole="button"
            accessibilityLabel="Log meal"
            accessibilityState={{ disabled: !canLog }}
            disabled={!canLog}
            onPress={logMeal}
            className={`h-11 w-11 items-center justify-center rounded-full bg-text ${canLog ? '' : 'opacity-30'}`}>
            <ArrowUpIcon size={22} color={theme.colors.bg} />
          </PressScale>
        </Animated.View>

        <Animated.View entering={rise(2)} className="mt-5 flex-row justify-between px-2">
          <Action
            label="Water"
            Icon={WaterIcon}
            onPress={() => addWater()}
            onLongPress={() => setWaterSheet(true)}
          />
          <Action label="Weigh-in" Icon={ScaleIcon} onPress={() => router.replace('/weigh-in')} />
          <Action label="Advisor" Icon={ChatIcon} onPress={() => router.replace('/advisor')} />
          <Action
            label="Workout"
            Icon={RunIcon}
            onPress={() => {
              router.back();
              router.navigate({ pathname: '/exercise', params: { tracker: '1' } });
            }}
          />
        </Animated.View>
      </KeyboardAvoidingView>

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
              pressableStyle={{ flex: 1 }}
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
    </View>
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
      <View className="h-16 w-16 items-center justify-center rounded-full border border-hairline/10 bg-glass/10">
        <Icon size={26} color={theme.colors.text} />
      </View>
      <Text className="mt-2 font-sans text-[13px] text-text/85">{label}</Text>
    </PressScale>
  );
}
