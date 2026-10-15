import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Pressable, Text } from 'react-native';
import Animated, { Easing, FadeOutDown, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// One toast at a time, above everything (mounted once in the root layout). A new toast replaces
// the current one; each lasts 4 s, long enough to reach its Undo.

type Toast = { id: number; message: string; action?: { label: string; onPress: () => void } };

let current: Toast | null = null;
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function showToast(message: string, action?: Toast['action']) {
  current = { id: nextId++, message, action };
  emit();
}

function hide(id: number) {
  if (current?.id !== id) return;
  current = null;
  emit();
}

/** Extra bottom space claimed by something floating above the dock (the pending meal card). */
const lifts = new Map<string, number>();
let lift = 0;
/** Extra bottom space claimed by `key` (0 releases it); toasts clear the largest claim. */
export function setToastLift(key: string, px: number) {
  if (px > 0) lifts.set(key, px);
  else lifts.delete(key);
  lift = Math.max(0, ...lifts.values());
  emit();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const DURATION_MS = 4000;
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

export function ToastHost() {
  const toast = useSyncExternalStore(subscribe, () => current);
  const extra = useSyncExternalStore(subscribe, () => lift);
  const insets = useSafeAreaInsets();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!toast) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => hide(toast.id), DURATION_MS);
    return () => clearTimeout(timer.current);
  }, [toast]);

  if (!toast) return null;
  return (
    <Animated.View
      key={toast.id}
      entering={SlideInDown.duration(400).easing(EASE_OUT)}
      exiting={FadeOutDown.duration(250)}
      pointerEvents="box-none"
      // Plain style only: NativeWind drops `style` on an Animated.View that also has className.
      style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 108 + extra }}>
      <Animated.View
        accessibilityLiveRegion="polite"
        className="flex-row items-center rounded-pill border border-hairline/10 bg-surface py-1.5 pl-5 pr-1.5">
        <Text className="flex-1 py-2 font-sans text-[15px] text-text">{toast.message}</Text>
        {toast.action ? (
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => {
              toast.action!.onPress();
              hide(toast.id);
            }}
            className="rounded-pill bg-glass/10 px-4 py-2 active:bg-glass/20">
            <Text className="font-sans-medium text-[15px] text-text">{toast.action.label}</Text>
          </Pressable>
        ) : null}
      </Animated.View>
    </Animated.View>
  );
}
