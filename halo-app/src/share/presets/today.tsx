// "Today" stickers: the day's score and what it says, in several voices.

import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import type { ShareSnapshot } from '../snapshot';
import { clock, dayParts, fmt, fonts, ink, scoreLabel, type Variant } from './ink';

type Props = { snapshot: ShareSnapshot; variant: Variant };

/** Our hero arc in miniature: Oura's shallow segment (r ≈ 0.54 W, ±43°), the score as its fill. */
export function ArcScore({ snapshot, variant }: Props) {
  const c = ink(variant, snapshot);
  const W = 220;
  const r = 0.54 * W;
  const half = (43 * Math.PI) / 180;
  const pad = 10;
  const cx = W / 2;
  const cy = pad + r;
  const point = (f: number) => {
    const a = -half + 2 * half * f;
    return { x: cx + r * Math.sin(a), y: cy - r * Math.cos(a) };
  };
  const start = point(0);
  const end = point(1);
  const knob = point(snapshot.overall / 100);
  const d = `M ${start.x} ${start.y} A ${r} ${r} 0 0 1 ${end.x} ${end.y}`;
  const length = r * half * 2;
  const height = pad + r * (1 - Math.cos(half)) + pad;
  return (
    <View style={{ width: W, alignItems: 'center' }}>
      <Svg width={W} height={height}>
        <Path d={d} stroke={c.fg} strokeOpacity={0.25} strokeWidth={6} fill="none" />
        <Path
          d={d}
          stroke={c.fg}
          strokeOpacity={snapshot.provisional ? 0.8 : 1}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={[length, length]}
          strokeDashoffset={length * (1 - snapshot.overall / 100)}
          fill="none"
        />
        <Circle cx={knob.x} cy={knob.y} r={5} fill={c.fg} />
      </Svg>
      {/* SVG text doesn't get the app fonts on Android: the number is RN Text. */}
      <Text
        style={[
          { color: c.fg, fontSize: 64, lineHeight: 76, marginTop: -4 },
          fonts.serif,
          c.shadow,
        ]}>
        {snapshot.overall}
      </Text>
      <Text style={[{ color: c.sub }, fonts.label, c.shadow]}>
        {scoreLabel(snapshot, 'OVERALL')}
      </Text>
    </View>
  );
}

/** The day's tagline in the hero's serif, the score and weekday under it. */
export function SerifHeadline({ snapshot, variant }: Props) {
  const c = ink(variant, snapshot);
  return (
    <View style={{ alignItems: 'center', maxWidth: 280 }}>
      <Text
        style={[
          { color: c.fg, fontSize: 44, lineHeight: 52, textAlign: 'center' },
          fonts.serif,
          c.shadow,
        ]}>
        {snapshot.tagline}
      </Text>
      <Text style={[{ color: c.sub, marginTop: 6 }, fonts.label, c.shadow]}>
        {dayParts(snapshot.day).weekday.toUpperCase()} · {scoreLabel(snapshot)} {snapshot.overall}
      </Text>
    </View>
  );
}

/** Big condensed numbers with a macro sub-row (Shareaura's "5.19 KM" card, for a day). */
export function CondensedScore({ snapshot, variant }: Props) {
  const c = ink(variant, snapshot);
  const { intake } = snapshot.facts;
  return (
    <View style={{ alignItems: 'flex-start' }}>
      <Text style={[{ color: c.fg, fontSize: 72, lineHeight: 86 }, fonts.anton, c.shadow]}>
        {snapshot.overall} {scoreLabel(snapshot)}
      </Text>
      <Text
        style={[
          { color: c.fg, fontSize: 15, letterSpacing: 1.2, marginTop: -6 },
          fonts.anton,
          c.shadow,
        ]}>
        {fmt(intake.kcal)} KCAL · {fmt(intake.proteinG)}G P · {fmt(intake.carbsG)}G C
      </Text>
    </View>
  );
}

const HEART =
  'M12 21s-7.5-4.6-9.6-9.3C.9 8.2 3 4.5 6.6 4.5c2.2 0 3.7 1.3 5.4 3.2 1.7-1.9 3.2-3.2 5.4-3.2 3.6 0 5.7 3.7 4.2 7.2C19.5 16.4 12 21 12 21z';
const REACTION_RED = '#F2394E';

/** A reaction pill: a heart and the score (red on light, a dark plate, or the theme colour). */
export function HeartPill({ snapshot, variant }: Props) {
  const c = ink(variant, snapshot);
  const plate = variant === 'light' ? REACTION_RED : c.fill;
  const heart = variant === 'dark' ? REACTION_RED : variant === 'light' ? '#FFFFFF' : c.onFill;
  const text = variant === 'light' ? '#FFFFFF' : c.onFill;
  return (
    <View style={[styles.pill, { backgroundColor: plate }]}>
      <Svg width={26} height={26} viewBox="0 0 24 24">
        <Path d={HEART} fill={heart} />
      </Svg>
      <Text style={[{ color: text, fontSize: 28, lineHeight: 34 }, fonts.sansMedium]}>
        {snapshot.overall}
      </Text>
      {snapshot.provisional ? (
        <Text style={[{ color: text, fontSize: 11, letterSpacing: 1.5 }, fonts.sansMedium]}>
          EARLY
        </Text>
      ) : null}
    </View>
  );
}

// The bubble is a pill (22 radius), so the tail takes over its whole bottom-right quarter: down
// the right edge from where the rounding starts, along the bottom, and out to the tip. In the
// tail's box the bubble's right edge is x = TAIL_X and its bottom y = TAIL_Y.
const TAIL_W = 31;
const TAIL_H = 23;
const TAIL_X = 24;
const TAIL_Y = 22;
const TAIL_PATH = 'M0 22 H14 C20 22.6 26 23.2 31 23 C26 20 24 15 24 6 V0 H0 Z';

/** A message bubble with a sent-time line under it. */
export function ChatBubble({ snapshot, variant }: Props) {
  const c = ink(variant, snapshot);
  const { mealsLogged, intake } = snapshot.facts;
  const text =
    mealsLogged > 0
      ? `Logged ${mealsLogged} ${mealsLogged === 1 ? 'meal' : 'meals'}, ${fmt(intake.kcal)} kcal`
      : `Day score ${snapshot.overall} so far`;
  return (
    <View style={{ alignItems: 'flex-end' }}>
      <View style={[styles.bubble, { backgroundColor: c.fill }]}>
        {/* One shape with the bubble: it replaces the rounded bottom-right corner. Drawn before
            the text, since its box reaches past the padding and would paint over the last letter. */}
        <Svg width={TAIL_W} height={TAIL_H} style={styles.tail}>
          <Path d={TAIL_PATH} fill={c.fill} />
        </Svg>
        <Text style={[fonts.sans, { color: c.onFill, fontSize: 18 }]}>{text}</Text>
      </View>
      <Text style={[fonts.sansMedium, { color: c.sub, fontSize: 13, marginTop: 6 }, c.shadow]}>
        Halo · {clock(snapshot.now)}
      </Text>
    </View>
  );
}

const MARKER = '#F6D04D';

/** A sentence on a slip of paper with its numbers run over by a highlighter. */
export function Highlighter({ snapshot, variant }: Props) {
  const c = ink(variant, snapshot);
  const { intake, mealsLogged } = snapshot.facts;
  const mark =
    variant === 'light' ? MARKER : variant === 'dark' ? `${MARKER}66` : 'rgba(255,255,255,0.35)';
  const hi = (text: string) => <Text style={{ backgroundColor: mark }}>{` ${text} `}</Text>;
  return (
    <View style={[styles.slip, { backgroundColor: c.fill }]}>
      <Text style={[{ color: c.onFill, fontSize: 17, lineHeight: 27 }, fonts.serif]}>
        {mealsLogged > 0 ? (
          <>
            {hi(`${fmt(intake.proteinG)} g protein`)} and {hi(`${fmt(intake.kcal)} kcal`)} logged by{' '}
            {hi(clock(snapshot.now))}, day score {hi(String(snapshot.overall))}.
          </>
        ) : (
          <>
            Day score {hi(String(snapshot.overall))} by {hi(clock(snapshot.now))}, first meal still
            to come.
          </>
        )}
      </Text>
    </View>
  );
}

/** The truest boast the day allows, in the first-person "if you're reading this" meme. */
function boast(s: ShareSnapshot) {
  const f = s.facts;
  if (f.intake.proteinG >= f.targets.proteinG) return 'I hit my protein';
  if (f.waterMl >= f.targets.waterMl) return 'I finished my water';
  if (f.steps != null && f.steps >= f.targets.steps) return 'I hit my steps';
  if (f.mealsLogged >= 3) return 'I logged every meal';
  return "I'm working on it";
}

/** Handwritten, a little uneven, like a note on the photo. */
export function Handwritten({ snapshot, variant }: Props) {
  const c = ink(variant, snapshot);
  return (
    <Text
      style={[
        { color: c.fg, fontSize: 40, lineHeight: 42, textAlign: 'center', maxWidth: 260 },
        fonts.hand,
        c.shadow,
        { transform: [{ rotate: '-3deg' }] },
      ]}>
      {`If you're reading this ${boast(snapshot)}`}
    </Text>
  );
}

const LED_AMBER = '#FFB21A';

/** A seven-segment-style readout: the date, then the score. */
export function LedReadout({ snapshot, variant }: Props) {
  const c = ink(variant, snapshot);
  const color = variant === 'accent' ? c.fg : LED_AMBER;
  const { dd, mm, yyyy } = dayParts(snapshot.day);
  const glow = {
    textShadowColor: `${color}AA`,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  };
  return (
    <View style={[styles.led, variant === 'dark' && { backgroundColor: '#0B0B0B' }]}>
      <Text style={[{ color, fontSize: 46, lineHeight: 46, letterSpacing: 2 }, fonts.led, glow]}>
        {dd} {mm} {yyyy}
      </Text>
      <Text style={[{ color, fontSize: 46, lineHeight: 46, letterSpacing: 2 }, fonts.led, glow]}>
        {snapshot.provisional ? 'EARLY' : 'SCORE'} {String(snapshot.overall).padStart(3, '0')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: { borderRadius: 22, paddingHorizontal: 18, paddingVertical: 11 },
  tail: { position: 'absolute', right: TAIL_X - TAIL_W, bottom: TAIL_Y - TAIL_H },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  slip: { maxWidth: 270, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 3 },
  led: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
});
