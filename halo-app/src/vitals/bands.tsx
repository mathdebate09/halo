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
import Svg, {
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Stop,
} from 'react-native-svg';

import { type Area, clamp } from '@/shared';
import { useHaloTheme } from '@/theme/theme-provider';
import { withAlpha } from '@/theme/themes';

import { AREA_ICONS, stateColor } from './areas';

// Oura's My Health header, as Vitals: one band per area, each as wide as a node, the three
// running parallel and touching in long, shallow curves. Each band is a bundle of faint stripes,
// coloured needs care → steady → thriving along the field and fading at the screen edges. Where
// the area's node sits along its band is its state (left needs care, right thriving), so the
// picture reads before any word; from the node a brighter trail of the same stripes runs along
// the band toward the middle of the screen, fading as it goes. A faint light sits behind it all.

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);
const ORB = 56;
const ICON = 24;
/** Stripes across a band (the trail uses the same ones, brighter). */
const LINES = 16;
/** How far along the band a node's trail runs. */
const TRAIL_LENGTH = 0.34;
const TRAIL_SAMPLES = 28;

type Pt = { x: number; y: number };
type Curve = [Pt, Pt, Pt, Pt];

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Band `i`'s centre line: one shallow curve, crest a little right of centre, with each band one
 * node-width below the last so the three touch.
 */
function curveFor(i: number, w: number, h: number): Curve {
  const left = h * 0.72 - ORB + i * ORB;
  const right = h * 0.54 - ORB + i * ORB;
  const lift = h * 0.16;
  return [
    { x: -0.1 * w, y: left },
    { x: 0.33 * w, y: mix(left, right, 0.33) - lift },
    { x: 0.72 * w, y: mix(left, right, 0.72) - lift },
    { x: 1.1 * w, y: right },
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

/** Score → place along the band: 40 and below at the left, 100 at the right, never at an edge. */
export const placeFor = (score: number) => 0.2 + 0.64 * clamp((score - 40) / 60, 0, 1);

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

/** Blend two #rrggbb colours. */
function mixHex(from: string, to: string, t: number): string {
  const f = parseInt(from.slice(1), 16);
  const g = parseInt(to.slice(1), 16);
  const channel = (shift: number) =>
    Math.round(mix((f >> shift) & 255, (g >> shift) & 255, t))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}

/** Along a band: [offset, opacity]. Gone at the screen edges, so the bands dissolve at the sides. */
const BAND_STOPS: [number, number][] = [
  [0, 0],
  [0.14, 0.4],
  [0.32, 0.4],
  [0.5, 0.4],
  [0.68, 0.4],
  [0.88, 0.4],
  [1, 0],
];

/**
 * The stripes' vertical offsets across a band and their brightness: brightest mid-band, slightly
 * uneven so they read as light rather than rules. Bands are vertical shifts of one curve, so
 * stripes shifted the same way stay parallel and neighbouring bands meet exactly.
 */
const STRIPES = Array.from({ length: LINES }, (_, k) => {
  const t = k / (LINES - 1);
  return {
    dy: (t * 2 - 1) * (ORB / 2) * 0.94,
    opacity: (0.5 + 0.5 * Math.sin(Math.PI * t)) * (0.85 + 0.15 * Math.cos(k * 1.7)),
  };
});

/** The band's centre line shifted by `dy` (one of its stripes). */
const pathOf = ([a, b, c, d]: Curve, dy: number) =>
  `M${a.x} ${a.y + dy}C${b.x} ${b.y + dy} ${c.x} ${c.y + dy} ${d.x} ${d.y + dy}`;

/** A band's whole body, for its faint wash. */
const bodyOf = (curve: Curve) => {
  const top = pathOf(curve, -ORB / 2);
  const [a, b, c, d] = curve.map((p) => ({ x: p.x, y: p.y + ORB / 2 }));
  return `${top}L${d!.x} ${d!.y}C${c!.x} ${c!.y} ${b!.x} ${b!.y} ${a!.x} ${a!.y}Z`;
};

/** Points along a node's trail, from its far end to the node (toward the middle of the screen). */
function trailOf(curve: Curve, at: number): Pt[] {
  const from = at >= 0.5 ? Math.max(0.02, at - TRAIL_LENGTH) : Math.min(0.98, at + TRAIL_LENGTH);
  return Array.from({ length: TRAIL_SAMPLES + 1 }, (_, k) =>
    pointAt(curve, mix(from, at, k / TRAIL_SAMPLES)),
  );
}

const polyline = (points: Pt[], dy: number) =>
  points.map((p, k) => `${k === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${(p.y + dy).toFixed(1)}`).join('');

/** The trail's outline, for the soft wash under its stripes. */
const trailBodyOf = (points: Pt[]) =>
  `${polyline(points, -ORB / 2)}${polyline([...points].reverse(), ORB / 2).replace('M', 'L')}Z`;

export function Bands({ areas, width, height }: { areas: Area[]; width: number; height: number }) {
  const { theme } = useHaloTheme();
  const reduced = useReducedMotion();
  const c = theme.colors;
  // Needs care → steady → thriving along the field, the same for every band.
  const colorAt = (x: number) =>
    x < 0.5
      ? mixHex(c.opportunity, c.steady, x / 0.5)
      : mixHex(c.steady, c.strength, (x - 0.5) / 0.5);

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
            <RadialGradient id="field" cx="60%" cy="45%" rx="65%" ry="55%">
              <Stop offset={0} stopColor={c.strength} stopOpacity={0.1} />
              <Stop offset={0.6} stopColor={c.strength} stopOpacity={0.04} />
              <Stop offset={1} stopColor={c.strength} stopOpacity={0} />
            </RadialGradient>
            <LinearGradient id="band" x1="0" y1="0" x2="1" y2="0">
              {BAND_STOPS.map(([x, opacity]) => (
                <Stop key={x} offset={x} stopColor={colorAt(x)} stopOpacity={opacity} />
              ))}
            </LinearGradient>
            {areas.map((area, i) => {
              const points = trailOf(curveFor(i, width, height), placeFor(area.score));
              const far = points[0]!;
              const node = points[TRAIL_SAMPLES]!;
              const tint = stateColor(c, area.state);
              // Along the trail: nothing at its far end, the node's tint at the node.
              return (
                <LinearGradient
                  key={area.key}
                  id={`trail-${i}`}
                  gradientUnits="userSpaceOnUse"
                  x1={far.x}
                  y1={far.y}
                  x2={node.x}
                  y2={node.y}>
                  <Stop offset={0} stopColor={tint} stopOpacity={0} />
                  <Stop offset={0.55} stopColor={tint} stopOpacity={0.35} />
                  <Stop offset={1} stopColor={tint} stopOpacity={0.95} />
                </LinearGradient>
              );
            })}
          </Defs>
          {/* A faint light behind the whole field. */}
          <Ellipse
            cx={width * 0.6}
            cy={height * 0.5}
            rx={width * 0.7}
            ry={height * 0.48}
            fill="url(#field)"
          />
          {areas.map((area, i) => {
            const curve = curveFor(i, width, height);
            const points = trailOf(curve, placeFor(area.score));
            return (
              <G key={area.key} opacity={area.source === 'assumed' ? 0.55 : 1}>
                {/* The band: a faint wash and its stripes, the full width of a node. */}
                <Path d={bodyOf(curve)} fill="url(#band)" fillOpacity={0.12} />
                {STRIPES.map((stripe, k) => (
                  <Path
                    key={`band-${k}`}
                    d={pathOf(curve, stripe.dy)}
                    stroke="url(#band)"
                    strokeOpacity={stripe.opacity}
                    strokeWidth={0.8}
                    fill="none"
                  />
                ))}
                {/* The node's trail over it: the same stripes, brighter, fading away from it. */}
                <Path d={trailBodyOf(points)} fill={`url(#trail-${i})`} fillOpacity={0.22} />
                {STRIPES.map((stripe, k) => (
                  <Path
                    key={`trail-${k}`}
                    d={polyline(points, stripe.dy)}
                    stroke={`url(#trail-${i})`}
                    strokeOpacity={stripe.opacity}
                    strokeWidth={0.8}
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
        {/* A solid disc of the state's tint mixed into the background, with a light rim (an
            assumed area's is fainter). Solid, so the ribbon's lines never show through. */}
        <View
          style={{
            width: ORB,
            height: ORB,
            borderRadius: ORB / 2,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: mixHex(theme.colors.bg, tint, area.source === 'assumed' ? 0.35 : 0.68),
            borderWidth: 1.5,
            borderColor: mixHex(tint, theme.colors.text, 0.55),
          }}>
          <Icon size={ICON} color={withAlpha(theme.colors.text, 0.9)} />
        </View>
      </Animated.View>
    </Animated.View>
  );
}
