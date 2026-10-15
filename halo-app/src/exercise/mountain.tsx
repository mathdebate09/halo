import { Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Path, Polyline, Rect, Stop } from 'react-native-svg';

import { motion } from '@/theme/motion';
import { useHaloTheme } from '@/theme/theme-provider';

// Today's steps as a climb (after references/steps-tracker-mountain.png): layered peaks in the
// theme's colours, a trail from the base to the summit, and the summit is the step goal. Drawn
// on a 360×440 grid and scaled to the width; labels are RN Text over the SVG (Android doesn't give
// SVG text the app fonts).

const VW = 360;
const VH = 440;

/** The trail from the base (front, right) to the summit, as grid points. */
const TRAIL: [number, number][] = [
  [262, 424],
  [212, 392],
  [150, 360],
  [124, 344],
  [148, 326],
  [212, 306],
  [238, 284],
  [226, 254],
  [192, 234],
  [180, 210],
  [204, 184],
  [198, 150],
  [178, 126],
  [172, 92],
];

const segLengths = TRAIL.slice(1).map(([x, y], i) =>
  Math.hypot(x - TRAIL[i]![0], y - TRAIL[i]![1]),
);
const TOTAL = segLengths.reduce((a, b) => a + b, 0);

/** The trail up to `share` of its length: the points walked, ending exactly at the position. */
function walked(share: number): [number, number][] {
  let left = Math.max(0, Math.min(1, share)) * TOTAL;
  const out: [number, number][] = [TRAIL[0]!];
  for (let i = 0; i < segLengths.length; i++) {
    const [x0, y0] = TRAIL[i]!;
    const [x1, y1] = TRAIL[i + 1]!;
    const len = segLengths[i]!;
    if (left >= len) {
      out.push([x1, y1]);
      left -= len;
      continue;
    }
    const t = len ? left / len : 0;
    out.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]);
    break;
  }
  return out;
}
const pointAt = (share: number) => walked(share).at(-1)!;
const pts = (list: [number, number][]) => list.map(([x, y]) => `${x},${y}`).join(' ');

const MILESTONES = [0.25, 0.5, 0.75];

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
/** `a` blended toward `b` by t (0 = a, 1 = b), as hex. */
function mix(a: string, b: string, t: number) {
  const [ar, ag, ab] = channels(a);
  const [br, bg, bb] = channels(b);
  const k = Math.max(0, Math.min(1, t));
  return `#${[ar! + (br! - ar!) * k, ag! + (bg! - ag!) * k, ab! + (bb! - ab!) * k]
    .map((v) => Math.round(v).toString(16).padStart(2, '0'))
    .join('')}`;
}

export function Mountain({ steps, goal, width }: { steps: number; goal: number; width: number }) {
  const { theme } = useHaloTheme();
  const c = theme.colors;
  const scale = width / VW;
  const height = VH * scale;
  const share = goal > 0 ? Math.min(1, steps / goal) : 0;
  const reached = share >= 1;
  const [hx, hy] = pointAt(share);
  const nextMilestone = MILESTONES.find((m) => m > share);

  // A peak's fill: snow-light at the top, the theme's tone in the body, fading toward the base.
  // A peak's fill, solid (layers must hide the ones behind): snow-light at the top, the theme's
  // tone in the body, deeper toward the base. `depth` pushes far layers toward the background.
  const stops = (depth: number) => [
    <Stop key="top" offset="0" stopColor={mix(c.glass, c.bg, 0.12 + depth)} />,
    <Stop key="body" offset="0.5" stopColor={mix(c.strength, c.bg, 0.3 + depth)} />,
    <Stop key="base" offset="1" stopColor={mix(c.strength, c.bg, 0.55 + depth * 0.6)} />,
  ];

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height} viewBox={`0 0 ${VW} ${VH}`}>
        <Defs>
          <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            {/* A glow behind the peaks that fades in and out: no hard edge at the top. */}
            <Stop offset="0" stopColor={c.accent} stopOpacity={0} />
            <Stop offset="0.45" stopColor={c.accent} stopOpacity={0.16} />
            <Stop offset="1" stopColor={c.bg} stopOpacity={0} />
          </LinearGradient>
          <LinearGradient id="far" x1="0" y1="0" x2="0" y2="1">
            {stops(0.38)}
          </LinearGradient>
          <LinearGradient id="main" x1="0" y1="0" x2="0" y2="1">
            {stops(0)}
          </LinearGradient>
          <LinearGradient id="right" x1="0" y1="0" x2="0" y2="1">
            {stops(0.1)}
          </LinearGradient>
          <LinearGradient id="near" x1="0" y1="0" x2="0" y2="1">
            {stops(0.2)}
          </LinearGradient>
          <LinearGradient id="mist" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={c.bg} stopOpacity={0} />
            <Stop offset="1" stopColor={c.bg} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={VW} height={VH} fill="url(#sky)" />

        {/* Far left ridge, the tall main peak, the right peak, then the near hills. */}
        <Path
          d="M0 270 C40 215 85 195 118 200 C155 206 186 250 226 320 L226 440 L0 440 Z"
          fill="url(#far)"
        />
        <Path
          d="M40 440 C70 360 108 205 142 118 C158 80 188 66 204 98 C230 152 256 252 300 332 C320 366 344 386 360 396 L360 440 Z"
          fill="url(#main)"
        />
        <Path
          d="M150 440 C188 352 218 196 244 164 C258 146 274 150 290 180 C316 234 340 304 360 334 L360 440 Z"
          fill="url(#right)"
        />
        <Path
          d="M0 340 C30 310 72 296 112 310 C152 324 190 366 230 440 L0 440 Z"
          fill="url(#near)"
        />
        <Path
          d="M118 440 C150 384 192 346 232 342 C272 338 312 366 360 404 L360 440 Z"
          fill="url(#near)"
        />

        {/* The trail: a pale path the whole way, the walked part brighter. */}
        <Polyline
          points={pts(TRAIL)}
          fill="none"
          stroke={c.glass}
          strokeOpacity={0.28}
          strokeWidth={9}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {share > 0 ? (
          <Polyline
            points={pts(walked(share))}
            fill="none"
            stroke={c.glass}
            strokeOpacity={0.75}
            strokeWidth={4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}

        {/* Milestones: passed ones filled, the next one hollow, later ones faint. */}
        {MILESTONES.map((m) => {
          const [x, y] = pointAt(m);
          const passed = share >= m;
          return (
            <Circle
              key={m}
              cx={x}
              cy={y}
              r={6}
              fill={passed ? c.accent : c.bg}
              fillOpacity={passed ? 1 : 0.6}
              stroke={c.accent}
              strokeOpacity={passed || m === nextMilestone ? 1 : 0.45}
              strokeWidth={2.5}
            />
          );
        })}
        {/* The summit: the goal. */}
        <Circle
          cx={TRAIL.at(-1)![0]}
          cy={TRAIL.at(-1)![1]}
          r={reached ? 11 : 7}
          fill={reached ? c.accent : c.bg}
          fillOpacity={reached ? 1 : 0.6}
          stroke={c.accent}
          strokeWidth={2.5}
        />
        {reached ? (
          <Path
            d={`M${TRAIL.at(-1)![0] - 5} ${TRAIL.at(-1)![1]} l3.5 3.5 l6.5 -7`}
            fill="none"
            stroke={c.onAccent}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <>
            {/* You are here: a soft halo around the current spot. */}
            <Circle cx={hx} cy={hy} r={13} fill={c.text} fillOpacity={0.16} />
            <Circle cx={hx} cy={hy} r={7} fill={c.text} stroke={c.bg} strokeWidth={2} />
          </>
        )}

        <Rect x={0} y={VH * 0.72} width={VW} height={VH * 0.28} fill="url(#mist)" />
      </Svg>

      {/* Step counts beside the milestones and the summit, to the left like the reference. */}
      {[...MILESTONES, 1].map((m) => {
        const [x, y] = m === 1 ? TRAIL.at(-1)! : pointAt(m);
        const value = Math.round((goal * m) / 100) * 100;
        return (
          <Animated.View
            key={m}
            entering={FadeIn.duration(500).delay(200).easing(motion.calm)}
            pointerEvents="none"
            style={{ position: 'absolute', right: width - x * scale + 14, top: y * scale - 10 }}>
            <Text
              className={`font-sans-medium text-[13px] ${share >= m ? 'text-text' : 'text-text/70'}`}>
              {value.toLocaleString('en-GB')} steps
            </Text>
          </Animated.View>
        );
      })}
    </View>
  );
}
