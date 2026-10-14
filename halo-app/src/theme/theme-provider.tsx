import { createContext, type ReactNode, use, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  interpolateColor,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { kv } from '@/lib/kv';

import { motion } from './motion';
import {
  DEFAULT_THEME_ID,
  isThemeId,
  type Theme,
  type ThemeColorKey,
  type ThemeId,
  themes,
  themeVars,
} from './themes';

const STORAGE_KEY = 'theme.id';

type ThemeContextValue = {
  /** The theme whose tokens are applied as CSS variables. Swaps at the crossfade midpoint. */
  theme: Theme;
  /** The theme being faded to (equals `theme` once settled). Use for the hero image. */
  target: Theme;
  setThemeId: (id: ThemeId) => void;
  /** 0 → 1 over a theme change; large layers interpolate `from` → `target` with it. */
  progress: SharedValue<number>;
  from: Theme;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function initialThemeId(): ThemeId {
  const saved = kv.getString(STORAGE_KEY);
  return isThemeId(saved) ? saved : DEFAULT_THEME_ID;
}

/**
 * Applies the current hero theme to the whole app. Small translucent tokens (text, chips,
 * hairlines) switch at the midpoint of the fade, when the large interpolating layers
 * (screen background, dock, veil) hide the swap.
 */
export function HaloThemeProvider({ children }: { children: ReactNode }) {
  const [targetId, setTargetId] = useState(initialThemeId);
  const [appliedId, setAppliedId] = useState(targetId);
  const [fromId, setFromId] = useState(targetId);
  const progress = useSharedValue(1);
  const swapTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const setThemeId = (id: ThemeId) => {
    if (id === targetId) return;
    kv.set(STORAGE_KEY, id);
    setFromId(targetId);
    setTargetId(id);
    progress.set(0);
    progress.set(withTiming(1, { duration: motion.themeFade, easing: motion.calm }));
    clearTimeout(swapTimer.current);
    swapTimer.current = setTimeout(() => setAppliedId(id), motion.themeFade / 2);
  };

  const value: ThemeContextValue = {
    theme: themes[appliedId],
    target: themes[targetId],
    from: themes[fromId],
    setThemeId,
    progress,
  };

  return (
    <ThemeContext value={value}>
      <View style={[styles.root, themeVars(themes[appliedId])]}>{children}</View>
    </ThemeContext>
  );
}

export function useHaloTheme() {
  const ctx = use(ThemeContext);
  if (!ctx) throw new Error('useHaloTheme must be used inside HaloThemeProvider');
  return ctx;
}

/** Animated backgroundColor for a theme token, crossfading on the UI thread during theme changes. */
export function useAnimatedThemeBackground(key: ThemeColorKey) {
  const { progress, from, target } = useHaloTheme();
  const a = from.colors[key];
  const b = target.colors[key];
  return useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.get(), [0, 1], [a, b]),
  }));
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
