import { type ComponentType, useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  type SharedValue,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { CarbsIcon, FatIcon, ProteinIcon } from '@/components/icons';
import type { DayFacts, SummaryTab } from '@/shared';
import { useHaloTheme } from '@/theme/theme-provider';
import { withAlpha } from '@/theme/themes';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

type Macro = 'carbs' | 'protein' | 'fat';
const MACROS: Macro[] = ['carbs', 'protein', 'fat'];
const ICONS: Record<Macro, ComponentType<{ size?: number; color: string }>> = {
  carbs: CarbsIcon,
  protein: ProteinIcon,
  fat: FatIcon,
};
/** kcal per gram: what each macro contributes to the day's calories. */
const KCAL_PER_G: Record<Macro, number> = { carbs: 4, protein: 4, fat: 9 };

const STROKE = 26;
const ICON = 15;

const rad = (deg: number) => (deg * Math.PI) / 180;
function point(c: number, r: number, deg: number) {
  return { x: c + r * Math.cos(rad(deg)), y: c + r * Math.sin(rad(deg)) };
}
function arc(c: number, r: number, from: number, to: number) {
  const a = point(c, r, from);
  const b = point(c, r, to);
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${b.x} ${b.y}`;
}

/**
 * The day's calories as one ring, shared out between the macros by their planned calories (after
 * the "health score" reference): each macro's arc is its slice of the circle, filled by its own
 * progress, with its icon set into the arc's start. The centre carries the meal score, the day's
 * calories, or the chosen macro (the other arcs dim).
 */
export function MacroWheel({
  tab,
  facts,
  size,
  armed,
}: {
  tab: SummaryTab;
  facts: DayFacts;
  size: number;
  armed: boolean;
}) {
  const { theme } = useHaloTheme();
  const reduced = useReducedMotion();
  const drawn = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (armed && !reduced) drawn.set(withTiming(1, { duration: 1100, easing: EASE_OUT }));
  }, [armed, reduced, drawn]);

  const colors: Record<Macro, string> = {
    carbs: theme.colors.steady,
    protein: theme.colors.strength,
    fat: theme.colors.opportunity,
  };
  const grams: Record<Macro, { value: number; target: number }> = {
    carbs: { value: facts.intake.carbsG, target: facts.targets.carbsG },
    protein: { value: facts.intake.proteinG, target: facts.targets.proteinG },
    fat: { value: facts.intake.fatG, target: facts.targets.fatG },
  };

  const c = size / 2;
  const r = c - STROKE / 2 - 2;
  // Round caps reach STROKE/2 past each end; the gap leaves a sliver of space between arcs.
  const capDeg = (STROKE / 2 / r) * (180 / Math.PI);
  const gapDeg = capDeg * 2 + 5;
  const planned = MACROS.map((m) => grams[m].target * KCAL_PER_G[m]);
  const total = planned.reduce((a, b) => a + b, 0) || 1;
  const usable = 360 - gapDeg * MACROS.length;

  let cursor = -90 + gapDeg / 2;
  const arcs = MACROS.map((m, i) => {
    const sweep = (planned[i]! / total) * usable;
    const from = cursor;
    cursor += sweep + gapDeg;
    return { m, from, to: from + sweep };
  });

  const selected: Macro | null = tab === 'carbs' || tab === 'protein' || tab === 'fat' ? tab : null;
  const fmt = (n: number) => Math.round(n).toLocaleString();
  const center =
    tab === 'meal'
      ? { big: `${Math.round(facts.dietScore)}`, small: 'out of 100' }
      : selected == null
        ? { big: fmt(facts.intake.kcal), small: `of ${fmt(facts.targets.kcal)} kcal` }
        : {
            big: `${fmt(grams[selected].value)} g`,
            small: `of ${fmt(grams[selected].target)} g`,
          };

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        {arcs.map(({ m, from, to }) => (
          <Segment
            key={m}
            d={arc(c, r, from, to)}
            length={rad(to - from) * r}
            fraction={Math.min(1, grams[m].value / Math.max(1, grams[m].target))}
            color={colors[m]}
            dim={selected != null && selected !== m}
            drawn={drawn}
          />
        ))}
        {/* Each icon sits in its arc's start cap, on the arc's own colour. */}
        {arcs.map(({ m, from }) => {
          const p = point(c, r, from);
          const dim = selected != null && selected !== m;
          return (
            <Circle
              key={m}
              cx={p.x}
              cy={p.y}
              r={STROKE / 2}
              fill={colors[m]}
              fillOpacity={dim ? 0.4 : 1}
            />
          );
        })}
      </Svg>

      {arcs.map(({ m, from }) => {
        const p = point(c, r, from);
        const Icon = ICONS[m];
        return (
          <View
            key={m}
            pointerEvents="none"
            style={{ position: 'absolute', left: p.x - ICON / 2, top: p.y - ICON / 2 }}>
            <Icon size={ICON} color={theme.colors.bg} />
          </View>
        );
      })}

      <View
        pointerEvents="none"
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
        className="items-center justify-center">
        <Animated.View key={tab} entering={FadeIn.duration(300)} className="items-center">
          <Text className="font-serif text-[46px] leading-[52px] text-text">{center.big}</Text>
          <Text className="font-sans text-[13px] text-muted">{center.small}</Text>
        </Animated.View>
      </View>
    </View>
  );
}

function Segment({
  d,
  length,
  fraction,
  color,
  dim,
  drawn,
}: {
  d: string;
  length: number;
  fraction: number;
  color: string;
  dim: boolean;
  drawn: SharedValue<number>;
}) {
  const fill = useAnimatedProps(() => ({
    strokeDashoffset: length * (1 - fraction * drawn.get()),
  }));
  return (
    <>
      <Path
        d={d}
        stroke={withAlpha(color, dim ? 0.08 : 0.2)}
        strokeWidth={STROKE}
        strokeLinecap="round"
        fill="none"
      />
      <AnimatedPath
        d={d}
        stroke={color}
        strokeOpacity={dim ? 0.35 : 1}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeDasharray={[length, length]}
        fill="none"
        animatedProps={fill}
      />
    </>
  );
}
