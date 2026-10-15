// A sticker on the card: drag, pinch and twist at once, tap to change its colours, drop it on the
// trash to remove it. Everything a finger moves runs on the UI thread; React only hears about
// commits (a tap, a removal, which sticker is on top).

import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { TrashIcon } from '@/components/icons';

const MIN_SCALE = 0.4;
const MAX_SCALE = 3;
const SNAP = (5 * Math.PI) / 180;
const TRASH_SIZE = 56;
/** Trash centre, from the card's bottom edge. */
const TRASH_FROM_BOTTOM = 92;
const TRASH_HIT = 48;
const SETTLE = { duration: 400, dampingRatio: 1 };
const LIFT_SPRING = { duration: 300, dampingRatio: 1 };

/** Shared between the card's stickers and its trash zone. */
export type DragState = {
  /** Stickers currently held. */
  dragging: SharedValue<number>;
  /** The held sticker's finger is over the trash. */
  overTrash: SharedValue<boolean>;
  /** The card's top-left corner in window coordinates (finger positions are absolute). */
  originX: SharedValue<number>;
  originY: SharedValue<number>;
  width: number;
  height: number;
};

export function useDragState(width: number, height: number): DragState {
  return {
    dragging: useSharedValue(0),
    overTrash: useSharedValue(false),
    originX: useSharedValue(0),
    originY: useSharedValue(0),
    width,
    height,
  };
}

type Props = {
  drag: DragState;
  z: number;
  onRaise: () => void;
  onTap: () => void;
  onRemove: () => void;
  children: ReactNode;
};

/** One sticker in its own pass-through layer, so it scales and turns about its own centre. */
export function Sticker({ drag, z, onRaise, onTap, onRemove, children }: Props) {
  const reduced = useReducedMotion();
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const scale = useSharedValue(1);
  const rotation = useSharedValue(0);
  const rawRotation = useSharedValue(0);
  const startScale = useSharedValue(1);
  const startRotation = useSharedValue(0);
  const hovering = useSharedValue(false);
  /** Shrinks the sticker over the trash, so the drop target reads before the release. */
  const shrink = useSharedValue(1);
  const held = useSharedValue(false);
  /** A slight lift while held, so the sticker answers the finger. */
  const lift = useSharedValue(1);
  const LIFT = reduced ? 1 : 1.04;
  const gone = useSharedValue(1);

  const release = () => {
    'worklet';
    if (!held.get()) return;
    held.set(false);
    lift.set(withSpring(1, LIFT_SPRING));
    drag.dragging.set(Math.max(0, drag.dragging.get() - 1));
    if (hovering.get()) {
      hovering.set(false);
      drag.overTrash.set(false);
      scheduleOnRN(Haptics.impactAsync, Haptics.ImpactFeedbackStyle.Medium);
      gone.set(
        withTiming(0, { duration: 200 }, (finished) => {
          if (finished) scheduleOnRN(onRemove);
        }),
      );
    }
  };

  const pan = Gesture.Pan()
    .averageTouches(true)
    .onStart(() => {
      held.set(true);
      lift.set(withSpring(LIFT, LIFT_SPRING));
      drag.dragging.set(drag.dragging.get() + 1);
      scheduleOnRN(onRaise);
    })
    .onChange((e) => {
      x.set(x.get() + e.changeX);
      y.set(y.get() + e.changeY);
      const fx = e.absoluteX - drag.originX.get() - drag.width / 2;
      const fy = e.absoluteY - drag.originY.get() - (drag.height - TRASH_FROM_BOTTOM);
      const over = fx * fx + fy * fy < TRASH_HIT * TRASH_HIT;
      if (over !== hovering.get()) {
        hovering.set(over);
        drag.overTrash.set(over);
        shrink.set(withSpring(over ? 0.5 : 1, SETTLE));
      }
    })
    .onFinalize(() => {
      release();
    });

  const pinch = Gesture.Pinch()
    .onStart(() => {
      startScale.set(scale.get());
    })
    .onUpdate((e) => {
      scale.set(Math.min(MAX_SCALE, Math.max(MIN_SCALE, startScale.get() * e.scale)));
    });

  // Turning snaps back to level within ±5°, with one tick as it catches.
  const rotate = Gesture.Rotation()
    .onStart(() => {
      startRotation.set(rawRotation.get());
    })
    .onUpdate((e) => {
      const raw = startRotation.get() + e.rotation;
      rawRotation.set(raw);
      const turns = Math.round(raw / (2 * Math.PI));
      const level = Math.abs(raw - turns * 2 * Math.PI) < SNAP;
      const next = level ? turns * 2 * Math.PI : raw;
      if (level && rotation.get() !== next) scheduleOnRN(Haptics.selectionAsync);
      rotation.set(next);
    });

  const tap = Gesture.Tap().onEnd((_e, success) => {
    if (success) scheduleOnRN(onTap);
  });

  const gesture = Gesture.Race(Gesture.Simultaneous(pan, pinch, rotate), tap);

  const style = useAnimatedStyle(() => ({
    opacity: (hovering.get() ? 0.6 : 1) * gone.get(),
    transform: [
      { translateX: x.get() },
      { translateY: y.get() },
      { rotate: `${rotation.get()}rad` },
      { scale: lift.get() * shrink.get() * scale.get() * (0.9 + 0.1 * gone.get()) },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.layer, { left: -drag.width, right: -drag.width, zIndex: z }]}
      entering={reduced ? undefined : popIn}>
      <GestureDetector gesture={gesture}>
        <Animated.View
          style={style}
          accessibilityRole="button"
          accessibilityHint="Tap to change colours">
          {children}
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

/** Rises in from just under full size: never from nothing. */
function popIn() {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.92 }] },
    animations: {
      opacity: withTiming(1, { duration: 220 }),
      transform: [{ scale: withSpring(1, { duration: 400, dampingRatio: 0.8 }) }],
    },
  };
}

/** Appears at the card's foot while a sticker is held; grows as one hovers over it. */
export function TrashZone({ drag }: { drag: DragState }) {
  useAnimatedReaction(
    () => drag.overTrash.get(),
    (over, before) => {
      if (over && before === false)
        scheduleOnRN(Haptics.impactAsync, Haptics.ImpactFeedbackStyle.Light);
    },
  );
  const style = useAnimatedStyle(() => {
    const shown = drag.dragging.get() > 0;
    const over = drag.overTrash.get();
    return {
      opacity: withTiming(shown ? 1 : 0, { duration: 200 }),
      transform: [
        { translateY: withTiming(shown ? 0 : 12, { duration: 200 }) },
        { scale: withSpring(over ? 1.2 : 1, SETTLE) },
      ],
      backgroundColor: over ? 'rgba(224,133,123,0.9)' : 'rgba(0,0,0,0.45)',
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.trash,
        {
          left: drag.width / 2 - TRASH_SIZE / 2,
          top: drag.height - TRASH_FROM_BOTTOM - TRASH_SIZE / 2,
        },
        style,
      ]}>
      <TrashIcon size={24} color="#FFFFFF" />
    </Animated.View>
  );
}

/** Hides the card's own controls (the + pill) while a sticker is held. */
export function useHiddenWhileDragging(drag: DragState) {
  return useAnimatedStyle(() => ({
    opacity: withTiming(drag.dragging.get() > 0 ? 0 : 1, { duration: 200 }),
  }));
}

const styles = StyleSheet.create({
  // Wider than the card so a sticker lays out at its natural width, centred on the card.
  layer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trash: {
    position: 'absolute',
    width: TRASH_SIZE,
    height: TRASH_SIZE,
    borderRadius: TRASH_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
