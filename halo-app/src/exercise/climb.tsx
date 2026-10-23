import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Text, useWindowDimensions, View } from 'react-native';

import { ExerciseIcon } from '@/components/icons';
import { PressScale } from '@/components/press-scale';
import { db } from '@/db/client';
import { hcDaily } from '@/db/schema';
import { useUnits } from '@/lib/units';
import { Mountain } from '@/exercise/mountain';
import { climbLine, formatDistance } from '@/shared';
import { useHaloTheme } from '@/theme/theme-provider';
import { useTodayScores } from '@/today/today-scores';

/**
 * The first thing Exercise says, one screen tall like Today's hero: today's steps as a climb to
 * the goal, distance and calories burned, the count, one line on what's left, and Activity
 * Analysis (centred, like Learn more) to scroll on to the detail below the fold.
 */
export function Climb({
  top,
  bottom,
  height,
  onAnalysis,
}: {
  top: number;
  bottom: number;
  height: number;
  onAnalysis: () => void;
}) {
  const { theme } = useHaloTheme();
  const { width } = useWindowDimensions();
  const scores = useTodayScores();
  const [units] = useUnits();
  const miles = units.weight === 'lb';
  const { data } = useLiveQuery(
    db
      .select({ distanceM: hcDaily.distanceM, activeKcal: hcDaily.activeKcal })
      .from(hcDaily)
      .where(eq(hcDaily.day, scores.day)),
    [scores.day],
  );
  const steps = scores.facts.steps;
  const goal = scores.facts.targets.steps;
  const distanceM = data[0]?.distanceM ?? null;
  const activeKcal = data[0]?.activeKcal ?? null;
  const facts = [
    distanceM ? formatDistance(distanceM, miles) : null,
    activeKcal != null ? `${activeKcal.toLocaleString('en-GB')} kcal` : null,
  ].filter(Boolean);

  return (
    <View style={{ minHeight: height }}>
      {/* The peak starts under the title, so the summit label never meets it. */}
      <View style={{ paddingTop: top + 20 }}>
        {/* The drawing's empty sky starts under the title; its summit sits ~100/440 down. */}
        <Mountain steps={steps ?? 0} goal={goal} width={width} />
      </View>
      <View className="absolute inset-x-0 flex-row items-center px-5" style={{ top: top + 12 }}>
        <ExerciseIcon size={26} color={theme.colors.text} />
        <Text accessibilityRole="header" className="ml-2.5 font-serif text-[30px] text-text">
          Exercise
        </Text>
      </View>

      {/* Figures and the way on, settled at the foot of the screen like Today's hero. */}
      {/* Over the misty foot of the mountain, below its lowest milestone. */}
      <View className="-mt-12 px-5" style={{ paddingBottom: bottom + 24 }}>
        <Text className="font-sans text-[17px] text-muted">{facts.join(' · ') || ' '}</Text>
        <Text className="font-serif text-[64px] leading-[76px] text-text">
          {(steps ?? 0).toLocaleString('en-GB')}
          <Text className="font-sans text-[18px] text-muted"> steps</Text>
        </Text>
        <Text className="mt-1 font-sans text-[16px] leading-[24px] text-text/85">
          {climbLine(steps, goal)}
        </Text>
        <PressScale
          accessibilityRole="button"
          accessibilityHint="Scrolls to the full breakdown"
          onPress={onAnalysis}
          pressableStyle={{ alignSelf: 'center' }}
          className="mt-7 rounded-pill bg-glass/10 px-8 py-3.5">
          <Text className="font-sans-medium text-[16px] text-text">Activity Analysis</Text>
        </PressScale>
      </View>
    </View>
  );
}
