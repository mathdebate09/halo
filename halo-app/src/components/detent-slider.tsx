import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const THUMB = 28;

type Props = {
  count: number;
  index: number;
  onChange: (index: number) => void;
  accessibilityLabel: string;
  accessibilityValueText: string;
};

/**
 * A slider with a few named stops (pace). Drag or tap; the thumb springs to the nearest stop
 * carrying the finger's velocity, and each stop change ticks a selection haptic.
 */
export function DetentSlider({
  count,
  index,
  onChange,
  accessibilityLabel,
  accessibilityValueText,
}: Props) {
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const travel = Math.max(1, width - THUMB);
  const segment = travel / (count - 1);
  const x = useSharedValue(0);
  const start = useSharedValue(0);

  // Follow external changes (and the first layout) without animating from 0.
  useEffect(() => {
    if (width) x.set(index * segment);
  }, [width, index, segment, x]);

  const commit = (i: number) => onChange(i);
  const tick = () => void Haptics.selectionAsync();
  useAnimatedReaction(
    () => Math.round(x.get() / segment),
    (current, previous) => {
      if (previous != null && current !== previous && width) scheduleOnRN(tick);
    },
  );

  const snap = (velocity: number) => {
    'worklet';
    const i = Math.max(0, Math.min(count - 1, Math.round(x.get() / segment)));
    x.set(
      reduced
        ? i * segment
        : withSpring(i * segment, { duration: 400, dampingRatio: 0.8, velocity }),
    );
    scheduleOnRN(commit, i);
  };

  const pan = Gesture.Pan()
    .onStart(() => {
      start.set(x.get());
    })
    .onUpdate((e) => {
      x.set(Math.max(0, Math.min(travel, start.get() + e.translationX)));
    })
    .onEnd((e) => {
      snap(e.velocityX);
    });
  const tap = Gesture.Tap().onEnd((e) => {
    x.set(Math.max(0, Math.min(travel, e.x - THUMB / 2)));
    snap(0);
  });

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  // Absolute and childless: animating width is layout-safe here.
  const fillStyle = useAnimatedStyle(() => ({ width: x.get() + THUMB / 2 }));

  return (
    <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ text: accessibilityValueText }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) =>
          onChange(
            Math.max(
              0,
              Math.min(count - 1, index + (e.nativeEvent.actionName === 'increment' ? 1 : -1)),
            ),
          )
        }
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        className="h-12 justify-center">
        <View className="mx-[14px] h-[3px] rounded-pill bg-glass/15" />
        <Animated.View style={fillStyle} className="absolute left-0 h-[3px] rounded-pill bg-text" />
        {Array.from({ length: count }, (_, i) => (
          <View
            key={i}
            style={{ left: THUMB / 2 + i * segment - 3 }}
            className="absolute h-[6px] w-[6px] rounded-full bg-text/50"
          />
        ))}
        <Animated.View
          style={[thumbStyle, { width: THUMB, height: THUMB }]}
          className="absolute rounded-full bg-text"
        />
      </View>
    </GestureDetector>
  );
}
