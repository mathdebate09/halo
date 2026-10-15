// Stickers for the share card, built only from the day's local snapshot (works offline). Each one
// draws in three variants the user taps through: light (white over a photo), dark (for bright
// photos) and accent (the day's theme colour).

import type { ReactNode } from 'react';
import { StyleSheet, Text, type TextStyle, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import type { ShareSnapshot } from './snapshot';

export type Variant = 'light' | 'dark' | 'accent';
export const VARIANTS: Variant[] = ['light', 'dark', 'accent'];
export const nextVariant = (v: Variant) => VARIANTS[(VARIANTS.indexOf(v) + 1) % VARIANTS.length];

type Ink = {
  fg: string;
  sub: string;
  /** A soft halo of the opposite tone, so text stays legible over busy photos. */
  shadow: TextStyle;
  /** Solid fill for bubbles and plates, and the text that sits on it. */
  fill: string;
  onFill: string;
};

function ink(variant: Variant, snapshot: ShareSnapshot): Ink {
  const darkShadow: TextStyle = {
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  };
  switch (variant) {
    case 'light':
      return {
        fg: '#FFFFFF',
        sub: 'rgba(255,255,255,0.82)',
        shadow: darkShadow,
        fill: '#FFFFFF',
        onFill: '#111111',
      };
    case 'dark':
      return {
        fg: '#111111',
        sub: 'rgba(17,17,17,0.78)',
        shadow: {
          textShadowColor: 'rgba(255,255,255,0.3)',
          textShadowOffset: { width: 0, height: 1 },
          textShadowRadius: 8,
        },
        fill: '#111111',
        onFill: '#FFFFFF',
      };
    case 'accent':
      return {
        fg: snapshot.theme.colors.accent,
        sub: snapshot.theme.colors.accent,
        shadow: darkShadow,
        fill: snapshot.theme.colors.accent,
        onFill: snapshot.theme.colors.onAccent,
      };
  }
}

export type PresetTab = 'today' | 'totals';

export type Preset = {
  id: string;
  tab: PresetTab;
  label: string;
  render: (snapshot: ShareSnapshot, variant: Variant) => ReactNode;
};

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const clock = (d: Date) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** Our hero arc in miniature: Oura's shallow segment (r ≈ 0.54 W, ±43°), the score as its fill. */
function ArcScore({ snapshot, variant }: { snapshot: ShareSnapshot; variant: Variant }) {
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
          styles.serif,
          c.shadow,
        ]}>
        {snapshot.overall}
      </Text>
      <Text style={[{ color: c.sub }, styles.label, c.shadow]}>
        {snapshot.provisional ? 'EARLY READ' : 'OVERALL'}
      </Text>
    </View>
  );
}

/** Big condensed numbers with a macro sub-row (Shareaura's "5.19 KM" card, for a day). */
function CondensedScore({ snapshot, variant }: { snapshot: ShareSnapshot; variant: Variant }) {
  const c = ink(variant, snapshot);
  const { intake } = snapshot.facts;
  return (
    <View style={{ alignItems: 'flex-start' }}>
      <Text style={[{ color: c.fg, fontSize: 72, lineHeight: 86 }, styles.anton, c.shadow]}>
        {snapshot.overall} {snapshot.provisional ? 'EARLY READ' : 'SCORE'}
      </Text>
      <Text
        style={[
          { color: c.fg, fontSize: 15, letterSpacing: 1.2, marginTop: -6 },
          styles.anton,
          c.shadow,
        ]}>
        {fmt(intake.kcal)} KCAL · {fmt(intake.proteinG)}G P · {fmt(intake.carbsG)}G C
      </Text>
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
function ChatBubble({ snapshot, variant }: { snapshot: ShareSnapshot; variant: Variant }) {
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
        <Text style={[styles.sans, { color: c.onFill, fontSize: 18 }]}>{text}</Text>
      </View>
      <Text style={[styles.sansMedium, { color: c.sub, fontSize: 13, marginTop: 6 }, c.shadow]}>
        Halo · {clock(snapshot.now)}
      </Text>
    </View>
  );
}

export const PRESETS: Preset[] = [
  {
    id: 'arc',
    tab: 'today',
    label: 'Arc and score',
    render: (s, v) => <ArcScore snapshot={s} variant={v} />,
  },
  {
    id: 'condensed',
    tab: 'today',
    label: 'Score and macros',
    render: (s, v) => <CondensedScore snapshot={s} variant={v} />,
  },
  {
    id: 'chat',
    tab: 'today',
    label: 'Message',
    render: (s, v) => <ChatBubble snapshot={s} variant={v} />,
  },
];

export const presetById = (id: string) => PRESETS.find((p) => p.id === id);

const styles = StyleSheet.create({
  serif: { fontFamily: 'InstrumentSerif_400Regular' },
  sans: { fontFamily: 'InclusiveSans_400Regular' },
  sansMedium: { fontFamily: 'InclusiveSans_500Medium' },
  anton: { fontFamily: 'Anton_400Regular' },
  label: { fontFamily: 'InclusiveSans_500Medium', fontSize: 12, letterSpacing: 2 },
  bubble: {
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  tail: { position: 'absolute', right: TAIL_X - TAIL_W, bottom: TAIL_Y - TAIL_H },
});
