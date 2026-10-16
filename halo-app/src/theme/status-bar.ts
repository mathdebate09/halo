import * as NavigationBar from 'expo-navigation-bar';
import { useFocusEffect } from 'expo-router';
import { setStatusBarStyle, type StatusBarStyle } from 'expo-status-bar';
import { useCallback } from 'react';

import type { Mode } from './themes';

// System bar icons: dark on light surfaces, light on dark ones and over photos. The mode sets the
// base; a focused screen over a photo (or the always-light Advisor) overrides it while focused.
// The navigation bar's buttons follow the same style (its names are inverted: a 'light' bar has
// dark buttons).
let base: StatusBarStyle = 'dark';
const overrides: { id: number; style: StatusBarStyle }[] = [];
let nextId = 0;

const NAV_STYLE = { dark: 'light', light: 'dark', auto: 'auto', inverted: 'inverted' } as const;

const apply = () => {
  const style = overrides.at(-1)?.style ?? base;
  setStatusBarStyle(style, true);
  NavigationBar.setStyle(NAV_STYLE[style]);
};

export function setStatusBarMode(mode: Mode) {
  base = mode === 'light' ? 'dark' : 'light';
  apply();
}

/** While the screen is focused, the status bar uses `style` (null: the mode's own). */
export function useStatusBarStyle(style: StatusBarStyle | null) {
  useFocusEffect(
    useCallback(() => {
      if (!style) return;
      const entry = { id: nextId++, style };
      overrides.push(entry);
      apply();
      return () => {
        overrides.splice(overrides.indexOf(entry), 1);
        apply();
      };
    }, [style]),
  );
}
