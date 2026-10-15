import type { BottomTabBarProps } from 'expo-router/tabs';
import { StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTimeOfDay } from '@/hooks/use-time-of-day';
import { useAnimatedThemeBackground, useHaloTheme } from '@/theme/theme-provider';
import { withAlpha } from '@/theme/themes';

import { ExerciseIcon, MoonIcon, PlusIcon, SunIcon, SunsetIcon, VitalsIcon } from './icons';
import { PressScale } from './press-scale';
import { Reveal } from './reveal';

export const DOCK_HEIGHT = 72;
const DOCK_GAP = 12;

/** Space a scrolling screen must leave at the bottom so content clears the floating dock. */
export function useDockInset() {
  const insets = useSafeAreaInsets();
  return insets.bottom + DOCK_GAP + DOCK_HEIGHT + 24;
}

const LABELS: Record<string, string> = { index: 'Today', exercise: 'Exercise', vitals: 'Vitals' };

/** Floating glass dock with the three tabs plus a separate log button (Oura home layout). */
export function Dock({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { theme } = useHaloTheme();
  const dockFill = useAnimatedThemeBackground('dock');
  const timeOfDay = useTimeOfDay();
  const TodayIcon = timeOfDay === 'day' ? SunIcon : timeOfDay === 'dusk' ? SunsetIcon : MoonIcon;
  const current = state.routes[state.index]?.name;
  const logFocused = current === 'log' || current === 'history';
  // The logger is full screen (its own close button); the dock comes back in its History.
  if (current === 'log') return null;

  return (
    <Reveal
      index={5}
      pointerEvents="box-none"
      style={[styles.row, { bottom: insets.bottom + DOCK_GAP }]}
      className="absolute inset-x-4 flex-row gap-3">
      <View className="flex-1 flex-row overflow-hidden rounded-pill border border-hairline/10">
        <Animated.View style={[StyleSheet.absoluteFill, styles.glass, dockFill]} />
        {state.routes.map((route, index) => {
          // The logger and its History are reached through the plus, drawn separately.
          if (route.name === 'log' || route.name === 'history') return null;
          const focused = state.index === index;
          const color = withAlpha(theme.colors.text, focused ? 1 : 0.55);
          const Icon =
            route.name === 'index'
              ? TodayIcon
              : route.name === 'exercise'
                ? ExerciseIcon
                : VitalsIcon;
          return (
            <PressScale
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={LABELS[route.name]}
              onPress={() => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
              }}
              pressableStyle={styles.tabTarget}
              style={styles.tab}
              className="items-center justify-center">
              <Icon color={color} />
              <Text style={{ color }} className="mt-1 font-sans text-[12px]">
                {LABELS[route.name]}
              </Text>
            </PressScale>
          );
        })}
      </View>

      {/* The Meal Logger is a section: its button inverts while you're in it. */}
      <PressScale
        accessibilityRole="tab"
        accessibilityState={{ selected: logFocused }}
        accessibilityLabel="Meal Logger"
        onPress={() => {
          if (state.routes[state.index]?.name !== 'log') navigation.navigate('log');
        }}
        style={styles.plus}
        className="items-center justify-center overflow-hidden rounded-pill border border-hairline/10">
        {logFocused ? (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.text }]} />
        ) : (
          <Animated.View style={[StyleSheet.absoluteFill, styles.glass, dockFill]} />
        )}
        <PlusIcon size={28} color={logFocused ? theme.colors.bg : theme.colors.text} />
      </PressScale>
    </Reveal>
  );
}

const styles = StyleSheet.create({
  row: { height: DOCK_HEIGHT },
  // No cheap real blur on Android: a translucent theme-tinted fill does the glass.
  glass: { opacity: 0.9 },
  tabTarget: { flex: 1 },
  tab: { height: DOCK_HEIGHT },
  plus: { width: DOCK_HEIGHT, height: DOCK_HEIGHT },
});
