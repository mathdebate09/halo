import { useFocusEffect } from 'expo-router';
import { setStatusBarStyle, type StatusBarStyle } from 'expo-status-bar';
import { useCallback } from 'react';

import type { Mode } from './themes';

// Status bar icons: dark on light surfaces, light on dark ones and over photos. The mode sets the
// base; a focused screen over a photo (or the always-light Advisor) overrides it while focused.
let base: StatusBarStyle = 'dark';
const overrides: { id: number; style: StatusBarStyle }[] = [];
let nextId = 0;

const apply = () => setStatusBarStyle(overrides.at(-1)?.style ?? base, true);

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
