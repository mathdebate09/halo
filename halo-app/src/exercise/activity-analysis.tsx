import { Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { useClock24 } from '@/lib/clock';
import { usePlan } from '@/lib/plan';
import { useUnits } from '@/lib/units';
import { ActivityRings } from '@/exercise/activity-rings';
import { Card, Figure, ValueWithUnit } from '@/exercise/card';
import { ConnectCard, EmptyCard } from '@/exercise/connect-card';
import { HourlyBars } from '@/exercise/hourly-bars';
import { SessionRow } from '@/exercise/session-row';
import { useActivity } from '@/exercise/use-activity';
import { type DaySteps, WeekBars } from '@/exercise/week-bars';
import {
  activeKcalGoalFor,
  addDays,
  dayStart,
  EXERCISE_GOAL_MIN,
  formatClock,
  formatDistance,
  formatPace,
  formatStride,
  paceFrom,
  strideM,
} from '@/shared';
import { motion } from '@/theme/motion';
import { useHaloTheme } from '@/theme/theme-provider';
import { useTodayScores } from '@/today/today-scores';

const WEEKDAY_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** The cards below Exercise's hero, all showing the day picked in the week strip. */
export function ActivityAnalysis({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (day: string) => void;
}) {
  const { theme } = useHaloTheme();
  const { width } = useWindowDimensions();
  const scores = useTodayScores();
  const plan = usePlan();
  const [units] = useUnits();
  const h24 = useClock24();
  // Distance follows the weight unit the user chose: kg → km, lb → miles.
  const miles = units.weight === 'lb';
  const today = scores.day;
  const { state, onConnected, rows, sessions, hours } = useActivity(selected, today);

  if (state == null) return null;
  if (state !== 'connected') return <ConnectCard state={state} onConnected={onConnected} />;
  if (!rows.some((r) => r.steps != null || r.exerciseMin != null)) return <EmptyCard />;

  const row = rows.find((r) => r.day === selected);
  const steps = row?.steps ?? 0;
  const goal = scores.facts.targets.steps;
  const activeGoal = plan ? activeKcalGoalFor(plan.bmr, plan.tdee) : null;
  const from = dayStart(selected).getTime();
  const daySessions = sessions.filter((s) => s.start >= from && s.start < from + 86_400_000);
  const weekSessions = sessions.filter((s) => s.start >= dayStart(addDays(today, -6)).getTime());
  const pace = paceFrom(weekSessions);
  const stride = strideM(row?.steps ?? null, row?.distanceM ?? null);
  const isToday = selected === today;
  const dayWord = isToday
    ? 'Today'
    : dayStart(selected, 12).toLocaleDateString('en-GB', { weekday: 'long' });
  const labels = [0, 6, 12, 18].map((h) =>
    h24 ? String(h).padStart(2, '0') : formatClock(h, false),
  ) as [string, string, string, string];

  const week: DaySteps[] = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(today, i - 6);
    return {
      day: d,
      label: WEEKDAY_SHORT[dayStart(d, 12).getDay()]!,
      steps: rows.find((r) => r.day === d)?.steps ?? null,
      today: d === today,
    };
  });

  const half = (width - 32 - 12) / 2;

  return (
    <Animated.View entering={FadeIn.duration(400).easing(motion.calm)}>
      <Card title="This week" className="mt-6">
        <WeekBars days={week} goal={goal} selected={selected} onSelect={onSelect} />
      </Card>

      <Animated.View key={selected} entering={FadeIn.duration(300).easing(motion.calm)}>
        <Card title="Activity" className="mt-3">
          <View className="flex-row items-center">
            <ActivityRings
              size={Math.min(150, width * 0.36)}
              rings={[
                { label: 'Steps', value: steps, goal, color: theme.colors.accent },
                {
                  label: 'Active',
                  value: row?.activeKcal ?? 0,
                  goal: activeGoal,
                  color: theme.colors.opportunity,
                },
                {
                  label: 'Exercise',
                  value: row?.exerciseMin ?? 0,
                  goal: EXERCISE_GOAL_MIN,
                  color: theme.colors.steady,
                },
              ]}
            />
            <View className="ml-6 flex-1 gap-3">
              <Figure
                label="Steps"
                value={steps.toLocaleString('en-GB')}
                of={goal.toLocaleString('en-GB')}
                color={theme.colors.accent}
                big
              />
              <Figure
                label="Active"
                value={row?.activeKcal != null ? row.activeKcal.toLocaleString('en-GB') : '—'}
                of={activeGoal ? activeGoal.toLocaleString('en-GB') : undefined}
                unit="KCAL"
                color={theme.colors.opportunity}
              />
              <Figure
                label="Exercise"
                value={String(row?.exerciseMin ?? 0)}
                of={String(EXERCISE_GOAL_MIN)}
                unit="MIN"
                color={theme.colors.steady}
              />
            </View>
          </View>
        </Card>

        <View className="mt-3 flex-row justify-between">
          <Card title="Step count" style={{ width: half }}>
            <Text className="font-sans text-[14px] text-muted">{dayWord}</Text>
            <Text
              className="font-sans-medium text-[32px] leading-[40px]"
              style={{ color: theme.colors.accent }}>
              {steps.toLocaleString('en-GB')}
            </Text>
            <View className="mt-3">
              <HourlyBars
                values={hours?.steps ?? null}
                color={theme.colors.accent}
                labels={labels}
              />
            </View>
          </Card>
          <Card title="Distance" style={{ width: half }}>
            <Text className="font-sans text-[14px] text-muted">{dayWord}</Text>
            <ValueWithUnit
              text={row?.distanceM ? formatDistance(row.distanceM, miles) : '—'}
              color={theme.colors.strength}
            />
            <View className="mt-3">
              <HourlyBars
                values={hours?.distanceM ?? null}
                color={theme.colors.strength}
                labels={labels}
              />
            </View>
          </Card>
        </View>

        <Card title="Sessions" className="mt-3">
          {daySessions.length ? (
            daySessions.map((s, i) => (
              <SessionRow key={s.id} session={s} miles={miles} first={i === 0} />
            ))
          ) : (
            <Text className="font-sans text-[15px] leading-[22px] text-muted">
              {isToday ? 'None yet today.' : `None on ${dayWord}.`} Workouts from your watch or apps
              appear here.
            </Text>
          )}
        </Card>

        <View className="mt-3 flex-row justify-between">
          <Card title="Pace" style={{ width: half }}>
            <ValueWithUnit
              text={pace ? formatPace(pace.secondsPerKm, miles) : '—'}
              color={theme.colors.text}
            />
            <Text className="mt-1 font-sans text-[13px] text-muted">
              {pace
                ? pace.kind === 'run'
                  ? 'Runs this week'
                  : 'Walks this week'
                : 'No timed walks or runs this week'}
            </Text>
          </Card>
          <Card title="Stride" style={{ width: half }}>
            <ValueWithUnit
              text={stride ? formatStride(stride, miles) : '—'}
              color={theme.colors.text}
            />
            <Text className="mt-1 font-sans text-[13px] text-muted">Distance per step</Text>
          </Card>
        </View>
      </Animated.View>
    </Animated.View>
  );
}
