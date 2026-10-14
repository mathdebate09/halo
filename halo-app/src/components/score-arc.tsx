import { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Stop,
} from 'react-native-svg';

import { launchReveal } from '@/components/reveal';
import { motion } from '@/theme/motion';
import { useHaloTheme } from '@/theme/theme-provider';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedG = Animated.createAnimatedComponent(G);

// Oura's arc, measured from references/oura/home.png: a circle segment whose chord spans 13-87 %
// of the width with a sagitta of 0.15 W, so r ≈ 0.54 W and the sweep is ±43° about vertical.
// Every hero's focus object sits at 30-37 % of the height, just under the apex.
export const ARC_APEX = 0.295;
const RADIUS = 0.54;
const HALF_SWEEP = (43 * Math.PI) / 180;
const TICKS = [20, 40, 60, 80];
/** Track and fill share one weight, like Oura's; the knob sits just proud of it. */
const STROKE = 9;
const TICK_OUT = 18;
const PAD = 32; // room above the apex for the tick dots and beside the ends for the labels

/** Drawn as the entrance reveals it (~0.35-0.95 of launchReveal), then tweened on change. */
const DRAW_FROM = 0.3;
const CHANGE_MS = 700;

type Props = {
  score: number;
  provisional: boolean;
  width: number;
  height: number;
  /** Bump to play the soft glow along the fill (a meal was just logged). */
  glow?: number;
};

/**
 * The day's score as a fill along a shallow arc over the hero's focus point. The fill draws on
 * with the Reveal entrance and tweens when the score moves; a provisional score is drawn fainter.
 */
export function ScoreArc({ score, provisional, width, height, glow = 0 }: Props) {
  const { theme } = useHaloTheme();
  const reduced = useReducedMotion();
  const r = RADIUS * width;
  const cx = width / 2;
  const apexY = ARC_APEX * height;
  const top = apexY - PAD;
  const cy = apexY + r - top; // circle centre in the svg's own coordinates
  const length = r * HALF_SWEEP * 2;
  const endDrop = r * (1 - Math.cos(HALF_SWEEP));
  const boxHeight = PAD + endDrop + PAD;

  const point = (fraction: number, radius = r) => {
    const angle = -HALF_SWEEP + 2 * HALF_SWEEP * fraction;
    return { x: cx + radius * Math.sin(angle), y: cy - radius * Math.cos(angle) };
  };
  const start = point(0);
  const end = point(1);
  const arcPath = `M ${start.x} ${start.y} A ${r} ${r} 0 0 1 ${end.x} ${end.y}`;

  const value = useSharedValue(score / 100);
  useEffect(() => {
    value.set(
      reduced ? score / 100 : withTiming(score / 100, { duration: CHANGE_MS, easing: motion.calm }),
    );
  }, [score, reduced, value]);

  const fillProps = useAnimatedProps(() => {
    const drawn = interpolate(launchReveal.get(), [DRAW_FROM, 1], [0, 1], Extrapolation.CLAMP);
    return { strokeDashoffset: length * (1 - value.get() * drawn) };
  });
  const knobProps = useAnimatedProps(() => {
    const drawn = interpolate(launchReveal.get(), [DRAW_FROM, 1], [0, 1], Extrapolation.CLAMP);
    const angle = -HALF_SWEEP + 2 * HALF_SWEEP * value.get() * drawn;
    return { cx: cx + r * Math.sin(angle), cy: cy - r * Math.cos(angle) };
  });
  const opacity = useSharedValue(provisional ? 0.8 : 1);
  useEffect(() => {
    opacity.set(withTiming(provisional ? 0.8 : 1, { duration: motion.themeFade }));
  }, [provisional, opacity]);
  const groupProps = useAnimatedProps(() => ({ opacity: opacity.get() }));

  // Celebration: a wide, soft copy of the fill swells and fades (~1 s) as the score moves.
  const glowOpacity = useSharedValue(0);
  useEffect(() => {
    if (glow === 0 || reduced) return;
    glowOpacity.set(
      withSequence(
        withTiming(0.45, { duration: 350, easing: motion.calm }),
        withTiming(0, { duration: 700, easing: motion.calm }),
      ),
    );
  }, [glow, reduced, glowOpacity]);
  const glowProps = useAnimatedProps(() => ({ opacity: glowOpacity.get() }));
  // Its own animated props: one useAnimatedProps object per component.
  const glowFillProps = useAnimatedProps(() => {
    const drawn = interpolate(launchReveal.get(), [DRAW_FROM, 1], [0, 1], Extrapolation.CLAMP);
    return { strokeDashoffset: length * (1 - value.get() * drawn) };
  });

  const arc = theme.colors.arc;
  const deg = (HALF_SWEEP * 180) / Math.PI;
  const zero = point(-0.045, r + 12);
  const hundred = point(1.045, r + 12);

  // SVG text doesn't pick up the app fonts on Android, so the end labels are RN Text.
  const label = (p: { x: number; y: number }, rotate: number, text: string) => (
    <Text
      className="absolute w-10 text-center font-sans text-[13px] leading-[16px] text-text/75"
      style={{ left: p.x - 20, top: top + p.y - 8, transform: [{ rotate: `${rotate}deg` }] }}>
      {text}
    </Text>
  );

  return (
    <>
      {label(zero, -deg, '0')}
      {label(hundred, deg, '100')}
      <Svg
        width={width}
        height={boxHeight}
        style={[styles.box, { top }]}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        <Defs>
          <LinearGradient
            id="fill"
            x1={start.x}
            y1={0}
            x2={end.x}
            y2={0}
            gradientUnits="userSpaceOnUse">
            <Stop offset={0} stopColor={arc} stopOpacity={0.35} />
            <Stop offset={0.6} stopColor={arc} stopOpacity={0.95} />
            <Stop offset={1} stopColor={arc} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Path d={arcPath} stroke={arc} strokeOpacity={0.22} strokeWidth={STROKE} fill="none" />
        {TICKS.map((t) => {
          const p = point(t / 100, r + TICK_OUT);
          return <Circle key={t} cx={p.x} cy={p.y} r={2.5} fill={arc} fillOpacity={0.7} />;
        })}
        <AnimatedG animatedProps={glowProps}>
          <AnimatedPath
            d={arcPath}
            stroke={arc}
            strokeWidth={STROKE * 2.6}
            strokeOpacity={0.5}
            strokeLinecap="round"
            strokeDasharray={[length, length]}
            fill="none"
            animatedProps={glowFillProps}
          />
        </AnimatedG>
        <AnimatedG animatedProps={groupProps}>
          <AnimatedPath
            d={arcPath}
            stroke="url(#fill)"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={[length, length]}
            fill="none"
            animatedProps={fillProps}
          />
          <AnimatedCircle r={STROKE / 2 + 2} fill={arc} animatedProps={knobProps} />
        </AnimatedG>
      </Svg>
    </>
  );
}

/**
 * Soft radial scrim behind the score so the number stays legible over bright peaks. Tinted with
 * the theme's veil colour, not black.
 */
export function ScoreScrim({ centerY, width }: { centerY: number; width: number }) {
  const { theme } = useHaloTheme();
  const w = width * 0.75;
  const h = width * 0.5;
  return (
    <Svg
      width={w}
      height={h}
      style={[styles.box, { top: centerY - h / 2, left: (width - w) / 2 }]}
      pointerEvents="none">
      <Defs>
        <RadialGradient id="scrim" cx="50%" cy="50%" rx="50%" ry="50%">
          <Stop offset={0} stopColor={theme.colors.veil} stopOpacity={0.35} />
          <Stop offset={0.6} stopColor={theme.colors.veil} stopOpacity={0.15} />
          <Stop offset={1} stopColor={theme.colors.veil} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} fill="url(#scrim)" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  box: { position: 'absolute', left: 0 },
});
