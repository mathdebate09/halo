import { useEffect } from 'react';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { PrimaryButton } from '@/components/button';
import { usePlan } from '@/lib/plan';
import { useUnits } from '@/lib/units';
import { goNext, useStepFocus } from '@/onboarding/navigation';
import { HEADER_SPACE } from '@/onboarding/onboarding-screen';
import { useOnboarding } from '@/onboarding/state';
import { displayWeight } from '@/shared';
import { useHaloTheme } from '@/theme/theme-provider';
import { withAlpha } from '@/theme/themes';

// scr 16, laid out after references/lifesum/lifesum-goalweightgraph-screen.png in Oura's dark
// language: a bold trajectory that bleeds off the left edge to the goal, then a "maintained"
// bar off the right; the goal weight big; the dated sentence as an estimate, not a promise.

const AnimatedPath = Animated.createAnimatedComponent(Path);
const CHART_H = 220;
const STROKE = 26;
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

/** A gently stepped descent (or climb): real weight doesn't move in a straight line. */
function trajectory(width: number, goalX: number, y0: number, y1: number) {
  const bumps = [0, 14, -4, 10, 0];
  const points: [number, number][] = [[-STROKE, y0]];
  for (let i = 1; i < bumps.length; i++) {
    const t = i / (bumps.length - 1);
    const eased = 1 - (1 - t) ** 1.6;
    points.push([
      goalX * t,
      y0 + (y1 - y0) * eased + (i < bumps.length - 1 ? bumps[i]! * Math.sign(y1 - y0 || 1) : 0),
    ]);
  }
  const d = points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    length += Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1]);
  }
  return { d, length };
}

const monthShort = (date: Date) => date.toLocaleDateString(undefined, { month: 'short' });

export default function ResultStep() {
  useStepFocus('result');
  const { theme } = useHaloTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const reduced = useReducedMotion();
  const { answers } = useOnboarding();
  const [units] = useUnits();
  const plan = usePlan();

  const current = answers.weightKg ?? 0;
  const goal = plan?.goalWeightKg ?? null;
  const goalDate = plan?.goalDate ?? null;
  const losing = goal != null && goal < current;
  const gaining = goal != null && goal > current;

  const goalX = width * 0.55;
  const y0 = losing ? 36 : gaining ? CHART_H - 70 : CHART_H / 2 - 20;
  const y1 = losing ? CHART_H - 70 : gaining ? 36 : CHART_H / 2 - 20;
  const { d, length } = trajectory(width, goalX, y0, y1);

  const draw = useSharedValue(reduced ? 1 : 0);
  const after = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    draw.set(withTiming(1, { duration: 900, easing: EASE_OUT }));
    after.set(withDelay(800, withTiming(1, { duration: 250, easing: EASE_OUT })));
  }, [draw, after, reduced]);
  const lineProps = useAnimatedProps(() => ({ strokeDashoffset: length * (1 - draw.get()) }));
  const afterStyle = useAnimatedStyle(() => ({ opacity: after.get() }));

  const show = (kg: number) => `${displayWeight(kg, units.weight)} ${units.weight}`;
  const when = goalDate?.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const name = answers.name;
  const headline =
    goal != null && when
      ? `${name ? `${name}, you` : 'You'} could reach your goal around ${when}`
      : `${name ? `${name}, your` : 'Your'} plan keeps you around ${show(current)} while you eat better`;
  const note = plan?.goalWeightRaised
    ? 'Raised to a healthy weight for your height.'
    : plan?.floorApplied
      ? 'Calories stay at a safe minimum, so it takes a little longer.'
      : null;

  const now = new Date();
  const labelEnd = goalDate ?? new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const labels = [
    { text: monthShort(now), x: 24, align: 'left' as const },
    { text: monthShort(labelEnd), x: goalX, align: 'center' as const },
    {
      text: monthShort(new Date(labelEnd.getFullYear(), labelEnd.getMonth() + 1, 1)),
      x: width - 24,
      align: 'right' as const,
    },
  ];
  const lineColor = theme.colors.accent;
  const barColor = withAlpha(theme.colors.text, 0.16);

  return (
    <View className="flex-1">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingTop: insets.top + HEADER_SPACE, paddingBottom: 24 }}>
        <Svg width={width} height={CHART_H}>
          <AnimatedPath
            d={d}
            stroke={lineColor}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            strokeDasharray={[length, length]}
            animatedProps={lineProps}
          />
        </Svg>
        <Animated.View
          style={[{ position: 'absolute', top: insets.top + HEADER_SPACE }, afterStyle]}>
          <Svg width={width} height={CHART_H}>
            <Circle cx={goalX} cy={y1} r={9} fill={theme.colors.bg} />
            <Line
              x1={goalX + 44}
              y1={y1}
              x2={width + STROKE}
              y2={y1}
              stroke={barColor}
              strokeWidth={STROKE + 8}
              strokeLinecap="round"
            />
            <Circle cx={goalX + 44} cy={y1} r={8} fill={theme.colors.text} />
          </Svg>
        </Animated.View>
        <View className="h-6" style={{ width }}>
          {labels.map((l) => (
            <Text
              key={l.align}
              style={{
                position: 'absolute',
                left: l.align === 'left' ? l.x : l.align === 'center' ? l.x - 40 : undefined,
                right: l.align === 'right' ? 24 : undefined,
                width: l.align === 'center' ? 80 : undefined,
                textAlign: l.align,
              }}
              className="font-sans text-[17px] text-text/80">
              {l.text}
            </Text>
          ))}
        </View>

        <View className="mt-12 px-6">
          {goal != null ? (
            <>
              <Text className="font-sans text-[18px] text-text/80">Your goal weight</Text>
              <Text className="mt-1 font-serif text-[88px] leading-[96px] text-text">
                {show(goal)}
              </Text>
              <View className="mt-3 self-start rounded-pill bg-accent px-5 py-2.5">
                <Text className="font-sans-medium text-[16px] text-on-accent">You can do it!</Text>
              </View>
            </>
          ) : null}
          <Text className="mt-12 font-sans-medium text-[13px] tracking-[2px] text-muted">
            YOUR PERSONALIZED PLAN
          </Text>
          <Text
            accessibilityRole="header"
            className="mt-2 font-serif text-[34px] leading-[40px] text-text">
            {headline}
          </Text>
          {note ? (
            <Text className="mt-3 font-sans text-[14px] text-opportunity">{note}</Text>
          ) : null}
        </View>
      </ScrollView>
      <View className="px-6 pt-3" style={{ paddingBottom: insets.bottom + 16 }}>
        <PrimaryButton label="Continue" onPress={() => goNext('result')} />
      </View>
    </View>
  );
}
