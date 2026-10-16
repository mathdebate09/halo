import { createContext, type ReactNode, use, useEffect, useRef, useState } from 'react';
import { Appearance, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import {
  interpolateColor,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { kv } from '@/lib/kv';

import { motion } from './motion';
import { setStatusBarMode } from './status-bar';
import {
  DEFAULT_MODE,
  DEFAULT_THEME_ID,
  isMode,
  isThemeId,
  type Mode,
  type Theme,
  type ThemeColorKey,
  type ThemeId,
  themeIn,
  themes,
  themeVars,
} from './themes';

const STORAGE_KEY = 'theme.id';
const MODE_KEY = 'theme.mode';

type ThemeContextValue = {
  /** The theme whose tokens are applied as CSS variables. Swaps at the crossfade midpoint. */
  theme: Theme;
  /** The theme being faded to (equals `theme` once settled). Use for the hero image. */
  target: Theme;
  setThemeId: (id: ThemeId) => void;
  /** 0 → 1 over a theme change; large layers interpolate `from` → `target` with it. */
  progress: SharedValue<number>;
  from: Theme;
  /** Light or dark surfaces (the hero image keeps its own dark tokens either way). */
  mode: Mode;
  setMode: (mode: Mode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function initialThemeId(): ThemeId {
  const saved = kv.getString(STORAGE_KEY);
  return isThemeId(saved) ? saved : DEFAULT_THEME_ID;
}

function initialMode(): Mode {
  const saved = kv.getString(MODE_KEY);
  return isMode(saved) ? saved : DEFAULT_MODE;
}

type Look = { id: ThemeId; mode: Mode };

/**
 * Applies the current hero theme to the whole app. Small translucent tokens (text, chips,
 * hairlines) switch at the midpoint of the fade, when the large interpolating layers
 * (screen background, dock, veil) hide the swap.
 */
export function HaloThemeProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<Look>(() => ({ id: initialThemeId(), mode: initialMode() }));
  const [applied, setApplied] = useState(target);
  const [from, setFrom] = useState(target);
  const progress = useSharedValue(1);
  const swapTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // A new theme and a new mode fade the same way: large layers interpolate, tokens swap halfway.
  const fadeTo = (next: Look) => {
    if (next.id === target.id && next.mode === target.mode) return;
    if (next.id !== target.id) kv.set(STORAGE_KEY, next.id);
    if (next.mode !== target.mode) kv.set(MODE_KEY, next.mode);
    setFrom(target);
    setTarget(next);
    progress.set(0);
    progress.set(withTiming(1, { duration: motion.themeFade, easing: motion.calm }));
    clearTimeout(swapTimer.current);
    swapTimer.current = setTimeout(() => setApplied(next), motion.themeFade / 2);
  };

  useEffect(() => {
    setStatusBarMode(target.mode);
    // System dialogs and pickers follow the app's mode, not the phone's.
    Appearance.setColorScheme(target.mode);
  }, [target.mode]);

  const theme = themeIn(applied.id, applied.mode);
  const value: ThemeContextValue = {
    theme,
    target: themeIn(target.id, target.mode),
    from: themeIn(from.id, from.mode),
    setThemeId: (id) => fadeTo({ ...target, id }),
    progress,
    mode: target.mode,
    setMode: (mode) => fadeTo({ ...target, mode }),
  };

  return (
    <ThemeContext value={value}>
      <View style={[styles.root, themeVars(theme)]}>{children}</View>
    </ThemeContext>
  );
}

/**
 * Over a photo (Today's hero, the onboarding intro and finale, share): the theme's dark tokens,
 * whose text contrast scripts/build-themes.mjs verified against the image, in either mode.
 */
export function ImageScope({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const ctx = useHaloTheme();
  const dark = (t: Theme) => themes[t.id];
  const theme = dark(ctx.theme);
  const value: ThemeContextValue = {
    ...ctx,
    theme,
    target: dark(ctx.target),
    from: dark(ctx.from),
  };
  return (
    <ThemeContext value={value}>
      <View style={[style, themeVars(theme)]}>{children}</View>
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
