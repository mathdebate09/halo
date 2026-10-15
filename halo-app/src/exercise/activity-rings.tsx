import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { motion } from '@/theme/motion';
import { withAlpha } from '@/theme/themes';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export type RingSpec = { label: string; value: number; goal: number | null; color: string };

/**
 * Concentric activity rings, outermost first (steps, active, exercise). Each fills slowly to its
 * share of the goal (capped at a full turn), one after another; a ring without a goal stays a track.
 */
export function ActivityRings({ rings, size }: { rings: RingSpec[]; size: number }) {
  const stroke = Math.round(size * 0.1);
  const gap = Math.round(stroke * 0.25);
  return (
    <View
      style={{ width: size, height: size }}
      accessibilityLabel={rings
        .map((r) => `${r.label} ${Math.round(r.value)}${r.goal ? ` of ${r.goal}` : ''}`)
        .join(', ')}>
      <Svg width={size} height={size}>
        {rings.map((r, i) => (
          <Ring
            key={r.label}
            index={i}
            size={size}
            radius={size / 2 - stroke / 2 - i * (stroke + gap)}
            stroke={stroke}
            share={r.goal ? Math.min(1, r.value / r.goal) : 0}
            color={r.color}
          />
        ))}
      </Svg>
    </View>
  );
}

function Ring({
  index,
  size,
  radius,
  stroke,
  share,
  color,
}: {
  index: number;
  size: number;
  radius: number;
  stroke: number;
  share: number;
  color: string;
}) {
  const reduced = useReducedMotion();
  const circumference = 2 * Math.PI * radius;
  const progress = useSharedValue(reduced ? share : 0);
  useEffect(() => {
    progress.set(
      reduced
        ? share
        : withDelay(index * 120, withTiming(share, { duration: 900, easing: motion.calm })),
    );
  }, [share, reduced, index, progress]);
  const arc = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.get()),
  }));
  const c = size / 2;
  return (
    <>
      <Circle
        cx={c}
        cy={c}
        r={radius}
        stroke={withAlpha(color, 0.18)}
        strokeWidth={stroke}
        fill="none"
      />
      <AnimatedCircle
        cx={c}
        cy={c}
        r={radius}
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        fill="none"
        strokeDasharray={`${circumference} ${circumference}`}
        animatedProps={arc}
        // Start at 12 o'clock.
        transform={`rotate(-90 ${c} ${c})`}
      />
    </>
  );
}
