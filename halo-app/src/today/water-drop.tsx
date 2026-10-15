import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { ClipPath, Defs, G, Path } from 'react-native-svg';

import { useHaloTheme } from '@/theme/theme-provider';
import { withAlpha } from '@/theme/themes';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

// A drop in a 100 × 120 box: tip at the top, round at the bottom (y 4 → 116).
const DROP = 'M50 4 C50 4 12 46 12 76 A38 38 0 0 0 88 76 C88 46 50 4 50 4 Z';
const TOP = 4;
const BOTTOM = 116;
const WATER = '#8DB3E2'; // a calm blue: water reads as water whatever the tier
const PERIOD = 50;
const AMPLITUDE = 3.5;

/**
 * The day's water as a drop filling to its share of the target, with a slow wave on the surface
 * (still under reduced motion). The percentage and amount sit in the middle.
 */
export function WaterDrop({
  ml,
  target,
  width,
  armed,
}: {
  ml: number;
  target: number;
  width: number;
  armed: boolean;
}) {
  const { theme } = useHaloTheme();
  const reduced = useReducedMotion();
  const fraction = Math.min(1, ml / Math.max(1, target));
  const level = useSharedValue(reduced ? fraction : 0);
  const phase = useSharedValue(0);

  useEffect(() => {
    if (!armed) return;
    level.set(reduced ? fraction : withTiming(fraction, { duration: 1100, easing: EASE_OUT }));
  }, [armed, reduced, fraction, level]);
  useEffect(() => {
    if (reduced) return;
    phase.set(withRepeat(withTiming(1, { duration: 2600, easing: Easing.linear }), -1, false));
  }, [reduced, phase]);

  const water = useAnimatedProps(() => {
    const y = BOTTOM - level.get() * (BOTTOM - TOP);
    const x0 = -PERIOD * 2 + phase.get() * PERIOD;
    let d = `M ${x0} ${y}`;
    for (let x = x0; x < 150; x += PERIOD) {
      d += ` q ${PERIOD / 4} ${-AMPLITUDE} ${PERIOD / 2} 0 q ${PERIOD / 4} ${AMPLITUDE} ${PERIOD / 2} 0`;
    }
    d += ` L 150 125 L ${x0} 125 Z`;
    return { d };
  });

  const height = width * 1.2;
  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height} viewBox="0 0 100 120">
        <Defs>
          <ClipPath id="drop">
            <Path d={DROP} />
          </ClipPath>
        </Defs>
        <Path d={DROP} fill={withAlpha(WATER, 0.1)} />
        <G clipPath="url(#drop)">
          <AnimatedPath fill={withAlpha(WATER, 0.85)} animatedProps={water} />
        </G>
        <Path
          d={DROP}
          fill="none"
          stroke={withAlpha(theme.colors.hairline, 0.2)}
          strokeWidth={0.8}
        />
      </Svg>
      <View
        pointerEvents="none"
        style={{ position: 'absolute', left: 0, right: 0, top: height * 0.3 }}
        className="items-center">
        <Text className="font-serif text-[48px] leading-[54px] text-text">
          {Math.round(fraction * 100)}%
        </Text>
        <Text className="font-sans text-[14px] text-text/85">
          {Math.round(ml).toLocaleString()} / {Math.round(target).toLocaleString()} ml
        </Text>
      </View>
    </View>
  );
}
