// "Totals" stickers: the day's numbers laid out as data (ring, bars, readouts, a receipt).

import { StyleSheet, Text, View } from 'react-native';
import Svg, { ClipPath, Defs, Path, Rect } from 'react-native-svg';

import { DROP, DROP_BOTTOM, DROP_TOP, WATER } from '@/today/water-drop';

import type { ShareSnapshot } from '../snapshot';
import { clock, dayParts, fmt, fonts, ink, scoreLabel, type Variant } from './ink';

type Props = { snapshot: ShareSnapshot; variant: Variant };

type Macro = { key: 'carbs' | 'protein' | 'fat'; short: string; value: number; target: number };
/** kcal per gram: each macro's slice of the day's calories. */
const KCAL_PER_G = { carbs: 4, protein: 4, fat: 9 } as const;

function macros(s: ShareSnapshot): Macro[] {
  const { intake, targets } = s.facts;
  return [
    { key: 'protein', short: 'P', value: intake.proteinG, target: targets.proteinG },
    { key: 'carbs', short: 'C', value: intake.carbsG, target: targets.carbsG },
    { key: 'fat', short: 'F', value: intake.fatG, target: targets.fatG },
  ];
}
const progress = (value: number, target: number) => Math.min(1, value / Math.max(1, target));

const rad = (deg: number) => (deg * Math.PI) / 180;
function arc(c: number, r: number, from: number, to: number) {
  const a = { x: c + r * Math.cos(rad(from)), y: c + r * Math.sin(rad(from)) };
  const b = { x: c + r * Math.cos(rad(to)), y: c + r * Math.sin(rad(to)) };
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${b.x} ${b.y}`;
}

/**
 * Learn more's macro wheel, still: one ring = the day's calories, shared between the macros by
 * their planned calories, each slice filled by its own progress. Kcal in the middle.
 */
export function MacroRing({ snapshot, variant }: Props) {
  const c = ink(variant, snapshot);
  const colors = {
    protein: snapshot.theme.colors.strength,
    carbs: snapshot.theme.colors.steady,
    fat: snapshot.theme.colors.opportunity,
  };
  const SIZE = 170;
  const STROKE = 16;
  const GAP = 6; // degrees between slices
  const r = (SIZE - STROKE) / 2;
  const list = macros(snapshot);
  const planned = list.map((m) => m.target * KCAL_PER_G[m.key]);
  const total = planned.reduce((a, b) => a + b, 0) || 1;
  let at = -90;
  const slices = list.map((m, i) => {
    const sweep = (planned[i] / total) * 360;
    const from = at + GAP / 2;
    const to = at + sweep - GAP / 2;
    at += sweep;
    return { m, from, to, fill: from + (to - from) * progress(m.value, m.target) };
  });
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={SIZE} height={SIZE} style={StyleSheet.absoluteFill}>
          {slices.map(({ m, from, to }) => (
            <Path
              key={`${m.key}-track`}
              d={arc(SIZE / 2, r, from, to)}
              stroke={c.faint}
              strokeWidth={STROKE}
              strokeLinecap="round"
              fill="none"
            />
          ))}
          {slices.map(({ m, from, fill }) =>
            fill - from > 1 ? (
              <Path
                key={m.key}
                d={arc(SIZE / 2, r, from, fill)}
                stroke={colors[m.key]}
                strokeWidth={STROKE}
                strokeLinecap="round"
                fill="none"
              />
            ) : null,
          )}
        </Svg>
        <Text style={[{ color: c.fg, fontSize: 34, lineHeight: 40 }, fonts.serif, c.shadow]}>
          {fmt(snapshot.facts.intake.kcal)}
        </Text>
        <Text style={[{ color: c.sub }, fonts.label, c.shadow]}>KCAL</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 14, marginTop: 10 }}>
        {list.map((m) => (
          <View key={m.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={[styles.dot, { backgroundColor: colors[m.key] }]} />
            <Text style={[{ color: c.fg, fontSize: 13 }, fonts.sansMedium, c.shadow]}>
              {m.short} {fmt(m.value)}g
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Shareaura's splits card for macros: each against its target as a bar. */
export function SplitBars({ snapshot, variant }: Props) {
  const c = ink(variant, snapshot);
  const BAR = 150;
  return (
    <View style={{ gap: 8 }}>
      <Text style={[{ color: c.fg, fontSize: 15 }, fonts.monoBold, c.shadow]}>Macros</Text>
      {macros(snapshot).map((m) => (
        <View key={m.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={[{ color: c.fg, fontSize: 14, width: 14 }, fonts.monoBold, c.shadow]}>
            {m.short}
          </Text>
          <View style={[styles.track, { width: BAR, backgroundColor: c.faint }]}>
            <View
              style={[
                styles.track,
                { width: BAR * progress(m.value, m.target), backgroundColor: c.fg },
              ]}
            />
          </View>
          <Text style={[{ color: c.fg, fontSize: 13 }, fonts.mono, c.shadow]}>
            {fmt(m.value)}/{fmt(m.target)}g
          </Text>
        </View>
      ))}
    </View>
  );
}

/** A terminal-style readout (Shareaura's LATI / LONG card): labels left, values right. */
export function MonoBlock({ snapshot, variant }: Props) {
  const c = ink(variant, snapshot);
  const f = snapshot.facts;
  const { dd, mm, yyyy } = dayParts(snapshot.day);
  const groups: [string, string][][] = [
    [
      ['DATE:', `${dd}.${mm}.${yyyy.slice(2)}`],
      ['TIME:', clock(snapshot.now)],
      [scoreLabel(snapshot).replace('EARLY READ', 'EARLY') + ':', String(snapshot.overall)],
    ],
    [
      ['KCAL:', fmt(f.intake.kcal)],
      ['PROT:', `${fmt(f.intake.proteinG)} g`],
      ['CARB:', `${fmt(f.intake.carbsG)} g`],
      ['FAT:', `${fmt(f.intake.fatG)} g`],
    ],
    [
      ['H2O:', `${fmt(f.waterMl)} ml`],
      ['STEPS:', f.steps == null ? '--' : fmt(f.steps)],
    ],
  ];
  return (
    <View style={{ width: 200 }}>
      {groups.map((rows, g) => (
        <View
          key={g}
          style={g > 0 ? { borderTopWidth: 1.5, borderTopColor: c.fg, paddingTop: 2 } : null}>
          {rows.map(([label, value]) => (
            <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={[{ color: c.fg, fontSize: 15, lineHeight: 20 }, fonts.mono, c.shadow]}>
                {label}
              </Text>
              <Text style={[{ color: c.fg, fontSize: 15, lineHeight: 20 }, fonts.mono, c.shadow]}>
                {value}
              </Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

/** Bars of a barcode, drawn from the day's own digits so each day's code differs. */
function barcode(seed: string, width: number) {
  const digits = seed.replace(/\D/g, '').split('').map(Number);
  const bars: { x: number; w: number }[] = [];
  let x = 0;
  let i = 0;
  while (x < width) {
    const d = digits[i % digits.length] ?? 3;
    const w = 1 + (d % 3);
    const gap = 1 + ((d + i) % 2) * 2;
    if (x + w > width) break;
    bars.push({ x, w });
    x += w + gap;
    i++;
  }
  return bars;
}

/** A till receipt for the day: meals as line items, totals, and a barcode. */
export function Receipt({ snapshot, variant }: Props) {
  const c = ink(variant, snapshot);
  const W = 230;
  const { dd, mm, yyyy } = dayParts(snapshot.day);
  const lines = snapshot.meals.length
    ? snapshot.meals.slice(0, 6)
    : [{ title: 'Nothing logged yet', mealType: 'snack' as const, kcal: 0 }];
  const more = snapshot.meals.length - lines.length;
  const text = (size = 12) => [
    { color: c.onFill, fontSize: size, lineHeight: size * 1.45 },
    fonts.mono,
  ];
  const rule = (
    <Text style={[text(), { opacity: 0.6 }]} numberOfLines={1} ellipsizeMode="clip">
      {'-'.repeat(40)}
    </Text>
  );
  const row = (left: string, right: string, bold = false) => (
    <View key={left} style={{ flexDirection: 'row', gap: 8 }}>
      <Text style={[text(), bold && fonts.monoBold, { flex: 1 }]} numberOfLines={1}>
        {left}
      </Text>
      <Text style={[text(), bold && fonts.monoBold]}>{right}</Text>
    </View>
  );
  return (
    <View style={[styles.paper, { width: W, backgroundColor: c.fill }]}>
      <Text style={[text(14), fonts.monoBold, { textAlign: 'center' }]}>HALO DAILY RECEIPT</Text>
      <Text style={[text(), { textAlign: 'center' }]}>
        {dd}.{mm}.{yyyy} {clock(snapshot.now)}
      </Text>
      {rule}
      {lines.map((m, i) => row(`${i + 1} ${m.title.toUpperCase()}`, m.kcal ? fmt(m.kcal) : '-'))}
      {more > 0 ? row(`+${more} MORE`, '') : null}
      {rule}
      {row('TOTAL KCAL', fmt(snapshot.facts.intake.kcal), true)}
      {row('PROTEIN', `${fmt(snapshot.facts.intake.proteinG)}g`)}
      {row(scoreLabel(snapshot, 'DAY SCORE'), String(snapshot.overall), true)}
      {rule}
      <Svg width={W - 28} height={34} style={{ marginTop: 4 }}>
        {barcode(
          `${snapshot.day}${snapshot.overall}${Math.round(snapshot.facts.intake.kcal)}`,
          W - 28,
        ).map((b) => (
          <Rect key={b.x} x={b.x} y={0} width={b.w} height={34} fill={c.onFill} />
        ))}
      </Svg>
      <Text style={[text(9), { textAlign: 'center', letterSpacing: 1 }]}>
        THANK YOU · SHAREHALO
      </Text>
    </View>
  );
}

/** The water drop from Learn more, still: filled to the day's share of the target. */
export function WaterDropSticker({ snapshot, variant }: Props) {
  const c = ink(variant, snapshot);
  const { waterMl, targets } = snapshot.facts;
  const share = progress(waterMl, targets.waterMl);
  const W = 110;
  const H = (W * 120) / 100;
  const y = DROP_BOTTOM - share * (DROP_BOTTOM - DROP_TOP);
  const litres = (ml: number) => `${(ml / 1000).toFixed(ml % 1000 === 0 ? 0 : 1)} L`;
  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={W} height={H} viewBox="0 0 100 120">
        <Defs>
          <ClipPath id="share-drop">
            <Path d={DROP} />
          </ClipPath>
        </Defs>
        <Path d={DROP} fill={c.faint} />
        <Rect x={0} y={y} width={100} height={120 - y} fill={WATER} clipPath="url(#share-drop)" />
        <Path d={DROP} fill="none" stroke={c.fg} strokeWidth={2.5} />
      </Svg>
      <Text
        style={[
          { color: c.fg, fontSize: 30, lineHeight: 36, marginTop: 4 },
          fonts.serif,
          c.shadow,
        ]}>
        {litres(waterMl)}
      </Text>
      <Text style={[{ color: c.sub }, fonts.label, c.shadow]}>
        OF {litres(targets.waterMl).toUpperCase()} WATER
      </Text>
    </View>
  );
}

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Monday to Sunday: days with a logged meal at full strength, today circled with its score. */
export function ThisWeek({ snapshot, variant }: Props) {
  const c = ink(variant, snapshot);
  const loggedDays = snapshot.week.filter((d) => d.logged).length;
  return (
    <View style={{ alignItems: 'center', gap: 10 }}>
      <Text style={[{ color: c.fg, fontSize: 16, letterSpacing: 0.5 }, fonts.sansMedium, c.shadow]}>
        THIS WEEK: {loggedDays} {loggedDays === 1 ? 'DAY' : 'DAYS'} LOGGED
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {snapshot.week.map((d, i) =>
          d.day === snapshot.day ? (
            <View
              key={d.day}
              style={[styles.today, { backgroundColor: c.fill, borderColor: c.fg }]}>
              <Text style={[{ color: c.onFill, fontSize: 15, lineHeight: 18 }, fonts.sansMedium]}>
                {snapshot.overall}
              </Text>
            </View>
          ) : (
            <Text
              key={d.day}
              style={[
                {
                  color: c.fg,
                  fontSize: 24,
                  opacity: d.logged ? 1 : d.logged === null ? 0.25 : 0.45,
                },
                fonts.sansMedium,
                c.shadow,
              ]}>
              {WEEKDAYS[i]}
            </Text>
          ),
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dot: { width: 8, height: 8, borderRadius: 4 },
  track: { height: 10, borderRadius: 2 },
  paper: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10, borderRadius: 2 },
  today: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
