import { and, desc, inArray, isNull } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOutDown,
  LayoutAnimationConfig,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DOCK_HEIGHT } from '@/components/dock';
import { ChevronRightIcon, DietIcon } from '@/components/icons';
import { PressScale } from '@/components/press-scale';
import { setToastLift } from '@/components/toast';
import { db } from '@/db/client';
import { meals } from '@/db/schema';
import { useHaloTheme } from '@/theme/theme-provider';

import { PENDING_STATUSES } from './analysis';

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const CARD_HEIGHT = 62;

/**
 * Meals between capture and logging, as one slim card above the dock: "Analysing…" while the job
 * runs, then "Ready to review". Tapping opens the confirm sheet for the one that needs you first.
 */
export function PendingMealCard() {
  const insets = useSafeAreaInsets();
  const { theme } = useHaloTheme();
  const { data } = useLiveQuery(
    db
      .select({
        id: meals.id,
        status: meals.status,
        title: meals.title,
        photoUri: meals.photoUri,
        note: meals.note,
      })
      .from(meals)
      .where(and(inArray(meals.status, [...PENDING_STATUSES]), isNull(meals.deletedAt)))
      .orderBy(desc(meals.eatenAt)),
  );

  // Ready ones first: they're the ones waiting on the user.
  const first = data.find((m) => m.status !== 'analysing') ?? data[0];
  const visible = !!first;
  // Toasts float above the card while it's showing.
  useEffect(() => {
    setToastLift(visible ? CARD_HEIGHT + 8 : 0);
    return () => setToastLift(0);
  }, [visible]);
  if (!first) return null;
  const more = data.length - 1;
  const label =
    first.status === 'analysing'
      ? 'Analysing your meal…'
      : first.status === 'failed'
        ? 'Add the details'
        : 'Ready to review';
  const name = first.title || first.note || 'Your meal';

  return (
    <Animated.View
      entering={FadeInDown.duration(500).easing(EASE_OUT)}
      exiting={FadeOutDown.duration(300)}
      style={{
        position: 'absolute',
        left: 16,
        right: 16,
        bottom: insets.bottom + 12 + DOCK_HEIGHT + 12,
      }}>
      <PressScale
        accessibilityRole="button"
        accessibilityLabel={`${name}. ${label}${more > 0 ? `, and ${more} more` : ''}`}
        onPress={() => router.push({ pathname: '/meal/[id]', params: { id: first.id } })}
        className="flex-row items-center rounded-pill border border-hairline/10 bg-surface p-2 pr-4">
        <View className="h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-glass/10">
          {first.photoUri ? (
            <Image
              source={{ uri: first.photoUri }}
              contentFit="cover"
              style={{ width: 44, height: 44 }}
            />
          ) : (
            <DietIcon size={20} color={theme.colors.text} />
          )}
        </View>
        <View className="ml-3 flex-1">
          <Text numberOfLines={1} className="font-sans-medium text-[15px] text-text">
            {name}
          </Text>
          <LayoutAnimationConfig skipEntering>
            <Animated.View
              key={label}
              entering={FadeIn.duration(400)}
              className="flex-row items-center">
              {first.status === 'analysing' ? <Breathing color={theme.colors.accent} /> : null}
              <Text className="font-sans text-[13px] text-muted">{label}</Text>
            </Animated.View>
          </LayoutAnimationConfig>
        </View>
        {more > 0 ? (
          <Text className="mr-2 font-sans-medium text-[13px] text-muted">+{more}</Text>
        ) : null}
        <ChevronRightIcon size={18} color={theme.colors.muted} />
      </PressScale>
    </Animated.View>
  );
}

/** A slow pulse while the analysis runs (static under reduced motion). */
function Breathing({ color }: { color: string }) {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (reduced) return;
    opacity.set(
      withRepeat(withTiming(0.3, { duration: 900, easing: Easing.inOut(Easing.sin) }), -1, true),
    );
  }, [reduced, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return (
    <Animated.View
      style={[
        { width: 6, height: 6, borderRadius: 3, backgroundColor: color, marginRight: 6 },
        style,
      ]}
    />
  );
}
