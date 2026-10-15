import { desc, eq, gte } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  type ComponentType,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Linking, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { ExerciseType, openHealthConnectSettings } from 'react-native-health-connect';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/button';
import { useDockInset } from '@/components/dock';
import {
  BikeIcon,
  ExerciseIcon,
  HikeIcon,
  RunIcon,
  StrengthIcon,
  SwimIcon,
  WalkIcon,
  YogaIcon,
} from '@/components/icons';
import { PressScale } from '@/components/press-scale';
import { SegmentedToggle } from '@/components/segmented-toggle';
import { ThemedScreen } from '@/components/themed-screen';
import { db } from '@/db/client';
import { hcDaily } from '@/db/schema';
import { formatTime, useClock24 } from '@/lib/clock';
import {
  connectHealthConnect,
  healthConnectState,
  type HealthConnectState,
  type HourlyActivity,
  readHourly,
  refreshHealthData,
  useExerciseSessions,
} from '@/lib/health-connect';
import { usePlan } from '@/lib/plan';
import { useUnits } from '@/lib/units';
import { HourlyBars } from '@/exercise/hourly-bars';
import { Mountain } from '@/exercise/mountain';
import { ActivityRings } from '@/exercise/activity-rings';
import { type DaySteps, WeekBars } from '@/exercise/week-bars';
import {
  activeKcalGoalFor,
  addDays,
  climbLine,
  dayStart,
  EXERCISE_GOAL_MIN,
  type ExerciseSessionInfo,
  formatClock,
  formatDistance,
  formatDuration,
  formatPace,
  formatStride,
  paceFrom,
  strideM,
} from '@/shared';
import { motion } from '@/theme/motion';
import { useHaloTheme } from '@/theme/theme-provider';
import { withAlpha } from '@/theme/themes';
import { useTodayScores } from '@/today/today-scores';

// Exercise (SPEC §3), laid out like Apple Health's summary but standalone: nothing here links
// away. The week strip picks the day, and every card shows that day. Aggregates come from the
// hc_daily cache (de-duplicated by Health Connect itself), hours are read on demand, sessions
// from the last two weeks. Burned calories are shown, never added to the food target.

type Tab = 'health' | 'tracker';
const TABS = [
  { id: 'health' as const, label: 'Health Connect' },
  { id: 'tracker' as const, label: 'HaloTracker' },
];
const PLAY_STORE = 'market://details?id=com.google.android.apps.healthdata';
const WEEKDAY_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function ExerciseScreen() {
  const insets = useSafeAreaInsets();
  const dockInset = useDockInset();
  const { theme } = useHaloTheme();
  const scores = useTodayScores();
  const params = useLocalSearchParams<{ tracker?: string }>();
  const [tab, setTab] = useState<Tab>(params.tracker === '1' ? 'tracker' : 'health');
  useEffect(() => {
    if (params.tracker === '1') setTab('tracker');
  }, [params.tracker]);
  const [selected, setSelected] = useState(scores.day);
  // A new day (4 am) moves the selection along with it.
  useEffect(() => setSelected(scores.day), [scores.day]);

  const dateLabel = dayStart(selected, 12)
    .toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })
    .toUpperCase();

  // The analysis starts below the climb; the hero's button scrolls there.
  const { height: screenHeight } = useWindowDimensions();
  const scroll = useRef<ScrollView>(null);
  const analysisY = useRef(0);
  const openAnalysis = () =>
    scroll.current?.scrollTo({ y: analysisY.current - insets.top - 8, animated: true });

  return (
    <ThemedScreen>
      <ScrollView
        ref={scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: dockInset }}>
        <Climb
          top={insets.top}
          bottom={dockInset}
          height={screenHeight}
          onAnalysis={openAnalysis}
        />

        <View
          className="px-4"
          onLayout={(e) => {
            analysisY.current = e.nativeEvent.layout.y;
          }}>
          <View className="mt-8 px-1">
            <Text className="font-sans-medium text-[13px] tracking-[1px] text-muted">
              {tab === 'health' ? dateLabel : ' '}
            </Text>
            <Text accessibilityRole="header" className="mt-1 font-serif text-[34px] text-text">
              Activity Analysis
            </Text>
          </View>
          <View className="mt-4">
            <SegmentedToggle
              options={TABS}
              value={tab}
              onChange={setTab}
              accessibilityLabel="Exercise source"
            />
          </View>
          {tab === 'health' ? (
            <HealthConnectView selected={selected} onSelect={setSelected} />
          ) : (
            <TrackerSoon />
          )}
        </View>
      </ScrollView>
    </ThemedScreen>
  );
}

/**
 * The first thing Exercise says, one screen tall like Today's hero: today's steps as a climb to
 * the goal, distance and calories burned, the count, one line on what's left, and Activity
 * Analysis (centred, like Learn more) to scroll on to the detail below the fold.
 */
function Climb({
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

function TrackerSoon() {
  return (
    <Animated.View entering={FadeIn.duration(300)} className="mt-[30%] items-center px-8">
      <Text className="font-serif text-[34px] text-text">Coming soon</Text>
      <Text className="mt-2 text-center font-sans text-[16px] leading-[24px] text-muted">
        Track walks and workouts right here.
      </Text>
    </Animated.View>
  );
}

function HealthConnectView({
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
  const sessions = useExerciseSessions();
  const [state, setState] = useState<HealthConnectState | null>(null);
  const [hourly, setHourly] = useState<{ day: string; data: HourlyActivity | null } | null>(null);

  // Re-check access and pull fresh numbers whenever the tab comes into view.
  useFocusEffect(
    useCallback(() => {
      healthConnectState().then(setState);
      refreshHealthData();
    }, []),
  );
  // The selected day's hours, read on demand (the bars wait; the rest of the page doesn't).
  useEffect(() => {
    if (state !== 'connected') return;
    let live = true;
    readHourly(selected).then((data) => {
      if (live) setHourly({ day: selected, data });
    });
    return () => {
      live = false;
    };
  }, [selected, state]);

  const today = scores.day;
  const { data: rows } = useLiveQuery(
    db
      .select()
      .from(hcDaily)
      .where(gte(hcDaily.day, addDays(today, -6)))
      .orderBy(desc(hcDaily.day)),
    [today],
  );

  if (state == null) return null;
  if (state !== 'connected') {
    return (
      <ConnectCard
        state={state}
        onConnected={() => {
          healthConnectState().then(setState);
          refreshHealthData(true);
        }}
      />
    );
  }
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
  const hours = hourly?.day === selected ? (hourly.data ?? null) : null;
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

/** A summary card: a muted title and its content on one seamless surface. */
function Card({
  title,
  className = '',
  style,
  children,
}: {
  title: string;
  className?: string;
  style?: { width: number };
  children: ReactNode;
}) {
  return (
    // One continuous surface: the title is a quiet label in the same padding, no rule under it.
    <View className={`rounded-card bg-surface px-4 pb-4 pt-3.5 ${className}`} style={style}>
      <Text className="mb-2 font-sans-medium text-[15px] text-muted">{title}</Text>
      {children}
    </View>
  );
}

/** A big coloured number with its unit in small caps after it ("5.9 KM", "9:40 /KM"). */
function ValueWithUnit({ text, color }: { text: string; color: string }) {
  const [value, ...rest] = text.split(' ');
  return (
    <Text className="font-sans-medium text-[32px] leading-[40px]" style={{ color }}>
      {value}
      {rest.length ? (
        <Text className="font-sans-medium text-[17px]"> {rest.join(' ').toUpperCase()}</Text>
      ) : null}
    </Text>
  );
}

/** One line of the Activity card: "Active" over "279/810 KCAL" in the metric's colour. */
function Figure({
  label,
  value,
  of,
  unit,
  color,
  big = false,
}: {
  label: string;
  value: string;
  of?: string;
  unit?: string;
  color: string;
  big?: boolean;
}) {
  return (
    <View>
      <Text className="font-sans text-[14px] text-text">{label}</Text>
      <Text
        className={`font-sans-medium ${big ? 'text-[26px] leading-[32px]' : 'text-[20px] leading-[26px]'}`}
        style={{ color }}>
        {value}
        {of ? `/${of}` : ''}
        {unit ? <Text className="text-[13px]"> {unit}</Text> : null}
      </Text>
    </View>
  );
}

type IconComponent = ComponentType<{ size?: number; color: string }>;

/** The glyph for a session's activity. */
function iconFor(session: ExerciseSessionInfo): IconComponent {
  switch (session.type) {
    case ExerciseType.WALKING:
      return WalkIcon;
    case ExerciseType.HIKING:
      return HikeIcon;
    case ExerciseType.RUNNING:
    case ExerciseType.RUNNING_TREADMILL:
      return RunIcon;
    case ExerciseType.BIKING:
    case ExerciseType.BIKING_STATIONARY:
      return BikeIcon;
    case ExerciseType.SWIMMING_POOL:
    case ExerciseType.SWIMMING_OPEN_WATER:
      return SwimIcon;
    case ExerciseType.WEIGHTLIFTING:
    case ExerciseType.STRENGTH_TRAINING:
    case ExerciseType.CALISTHENICS:
      return StrengthIcon;
    case ExerciseType.YOGA:
    case ExerciseType.PILATES:
    case ExerciseType.STRETCHING:
      return YogaIcon;
    default:
      return session.kind === 'walk' ? WalkIcon : session.kind === 'run' ? RunIcon : ExerciseIcon;
  }
}

function SessionRow({
  session: s,
  miles,
  first,
}: {
  session: ExerciseSessionInfo;
  miles: boolean;
  first: boolean;
}) {
  const { theme } = useHaloTheme();
  const Icon = iconFor(s);
  const details = [
    formatDuration(s.end - s.start),
    s.distanceM ? formatDistance(s.distanceM, miles) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <View
      className={`flex-row items-center ${first ? '' : 'mt-3 border-t border-hairline/10 pt-3'}`}>
      <View
        className="h-11 w-11 items-center justify-center rounded-full"
        style={{ backgroundColor: withAlpha(theme.colors.accent, 0.16) }}>
        <Icon size={22} color={theme.colors.accent} />
      </View>
      <View className="ml-3 flex-1">
        <Text className="font-sans-medium text-[16px] text-text">{s.title}</Text>
        <Text className="mt-0.5 font-sans text-[14px] text-muted">
          {formatTime(new Date(s.start))} · {details}
        </Text>
      </View>
    </View>
  );
}

const CONNECT_COPY: Record<
  Exclude<HealthConnectState, 'connected'>,
  { title: string; line: string; button: string }
> = {
  unavailable: {
    title: 'Get Health Connect',
    line: 'Steps, distance and workouts from your phone and watch, measured.',
    button: 'Open Play Store',
  },
  update: {
    title: 'Update Health Connect',
    line: 'This version is too old for Halo to read your activity.',
    button: 'Update',
  },
  denied: {
    title: 'Connect Health Connect',
    line: 'Steps, distance and workouts from your phone and watch, measured.',
    button: 'Connect',
  },
};

/** The one card for each way Health Connect can be missing: no fake numbers. */
function ConnectCard({
  state,
  onConnected,
}: {
  state: Exclude<HealthConnectState, 'connected'>;
  onConnected: () => void;
}) {
  const copy = CONNECT_COPY[state];
  const act = async () => {
    if (state === 'denied') {
      if ((await connectHealthConnect()) === 'connected') onConnected();
      return;
    }
    Linking.openURL(PLAY_STORE).catch(() => {});
  };
  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      className="mt-8 rounded-card border border-hairline/10 bg-surface px-5 pb-5 pt-6">
      <Text className="font-serif text-[28px] text-text">{copy.title}</Text>
      <Text className="mt-2 font-sans text-[16px] leading-[24px] text-muted">{copy.line}</Text>
      <View className="mt-6">
        <PrimaryButton label={copy.button} onPress={act} />
      </View>
    </Animated.View>
  );
}

/** Connected, but nothing recorded in a week: point at Health Connect itself. */
function EmptyCard() {
  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      className="mt-8 rounded-card border border-hairline/10 bg-surface px-5 pb-5 pt-6">
      <Text className="font-serif text-[28px] text-text">Nothing recorded yet</Text>
      <Text className="mt-2 font-sans text-[16px] leading-[24px] text-muted">
        No steps or workouts in Health Connect this week. Check that your phone or watch app shares
        activity with it.
      </Text>
      <View className="mt-6">
        <PrimaryButton label="Open Health Connect" onPress={() => openHealthConnectSettings()} />
      </View>
    </Animated.View>
  );
}
