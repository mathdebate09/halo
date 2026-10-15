import { View } from 'react-native';
import { useEffect } from 'react';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, G, LinearGradient, Path, Stop } from 'react-native-svg';

import { type Area, clamp } from '@/shared';
import { useHaloTheme } from '@/theme/theme-provider';
import { withAlpha } from '@/theme/themes';

import { AREA_ICONS, stateColor } from './areas';

// Oura's My Health header, as Vitals: one band per area, sweeping across the screen. Where an
// area sits along its band is its state (left needs care, right thriving), so the picture reads
// before any word. Each band is a fan of hairlines, brightest around its orb.

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);
const LINES = 9;
const LINE_GAP = 3.2;
const ORB = 54;

type Pt = { x: number; y: number };
type Curve = [Pt, Pt, Pt, Pt];

/** A band's curve: rising from the left edge to a crest right of centre, easing down off-screen. */
function curveFor(i: number, w: number, h: number): Curve {
  const y = h * (0.28 + 0.27 * i);
  return [
    { x: -0.08 * w, y: y + 0.17 * h },
    { x: 0.3 * w, y: y - 0.1 * h },
    { x: 0.72 * w, y: y - 0.14 * h },
    { x: 1.08 * w, y: y + 0.04 * h },
  ];
}

function pointAt([a, b, c, d]: Curve, t: number): Pt {
  'worklet';
  const u = 1 - t;
  return {
    x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
    y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y,
  };
}

/** Score → place along the band: 40 and below sit at the left, 100 at the right. */
export const placeFor = (score: number) => 0.12 + 0.76 * clamp((score - 40) / 60, 0, 1);

/** An orb settling into place: fades in from 0.92 scale, slow and eased (never from nothing). */
const orbIn = (delay: number) => () => {
  'worklet';
  const timing = { duration: 700, easing: EASE_OUT };
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.92 }] },
    animations: {
      opacity: withDelay(delay, withTiming(1, timing)),
      transform: [{ scale: withDelay(delay, withTiming(1, timing)) }],
    },
  };
};

const pathOf = ([a, b, c, d]: Curve, dy: number) =>
  `M${a.x} ${a.y + dy}C${b.x} ${b.y + dy} ${c.x} ${c.y + dy} ${d.x} ${d.y + dy}`;

export function Bands({ areas, width, height }: { areas: Area[]; width: number; height: number }) {
  const { theme } = useHaloTheme();
  const reduced = useReducedMotion();
  const c = theme.colors;
  return (
    <View
      style={{ width, height }}
      accessible={false}
      importantForAccessibility="no-hide-descendants">
      <Animated.View
        entering={FadeIn.duration(900).easing(EASE_OUT)}
        style={{ position: 'absolute' }}>
        <Svg width={width} height={height}>
          <Defs>
            {areas.map((area, i) => {
              const at = placeFor(area.score);
              // Brightest at the orb; the colour runs needs care → steady → thriving left to right.
              const stops: [number, number][] = [
                [0, 0.08],
                [Math.max(0.01, at - 0.3), 0.14],
                [Math.max(0.02, at - 0.12), 0.55],
                [at, 0.95],
                [Math.min(0.98, at + 0.12), 0.55],
                [Math.min(0.99, at + 0.3), 0.14],
                [1, 0.08],
              ];
              return (
                <LinearGradient key={area.key} id={`band-${i}`} x1="0" y1="0" x2="1" y2="0">
                  {stops.map(([offset, opacity]) => (
                    <Stop
                      key={offset}
                      offset={offset}
                      stopColor={
                        offset < 0.4 ? c.opportunity : offset < 0.65 ? c.steady : c.strength
                      }
                      stopOpacity={opacity}
                    />
                  ))}
                </LinearGradient>
              );
            })}
          </Defs>
          {areas.map((area, i) => {
            const curve = curveFor(i, width, height);
            return (
              <G key={area.key}>
                {Array.from({ length: LINES }, (_, k) => (
                  <Path
                    key={k}
                    d={pathOf(curve, (k - (LINES - 1) / 2) * LINE_GAP)}
                    stroke={`url(#band-${i})`}
                    strokeWidth={k === (LINES - 1) / 2 ? 1.4 : 0.9}
                    fill="none"
                  />
                ))}
              </G>
            );
          })}
        </Svg>
      </Animated.View>

      {areas.map((area, i) => (
        <Orb
          key={area.key}
          area={area}
          curve={curveFor(i, width, height)}
          delay={350 + i * 140}
          reduced={reduced}
        />
      ))}
    </View>
  );
}

/**
 * One area's orb. It settles in on first show; when the area's score changes while in view (a
 * sync landing), it glides along its band to the new place instead of jumping.
 */
function Orb({
  area,
  curve,
  delay,
  reduced,
}: {
  area: Area;
  curve: Curve;
  delay: number;
  reduced: boolean;
}) {
  const { theme } = useHaloTheme();
  const Icon = AREA_ICONS[area.key];
  const tint = stateColor(theme.colors, area.state);
  const place = placeFor(area.score);
  const t = useSharedValue(place);
  useEffect(() => {
    t.set(reduced ? place : withTiming(place, { duration: 900, easing: EASE_IN_OUT }));
  }, [place, reduced, t]);
  const position = useAnimatedStyle(() => {
    const p = pointAt(curve, t.get());
    return { transform: [{ translateX: p.x - ORB / 2 }, { translateY: p.y - ORB / 2 }] };
  });
  return (
    <Animated.View style={[{ position: 'absolute', left: 0, top: 0 }, position]}>
      <Animated.View entering={reduced ? FadeIn.duration(400) : orbIn(delay)}>
        <View
          style={{
            width: ORB,
            height: ORB,
            borderRadius: ORB / 2,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: withAlpha(tint, 0.28),
            borderWidth: 1,
            borderColor: withAlpha(tint, 0.45),
          }}>
          <Icon size={24} color={theme.colors.text} />
        </View>
      </Animated.View>
    </Animated.View>
  );
}
