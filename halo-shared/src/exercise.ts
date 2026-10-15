// Exercise numbers from Health Connect (SPEC §3 Exercise): pace from walk and run sessions, stride
// when there are no sessions, and distance/pace in the user's units. Pure, so it's tested here.

export type SessionKind = 'walk' | 'run' | 'ride' | 'other';

/** One exercise session as Exercise shows it. Times are epoch ms. */
export type ExerciseSessionInfo = {
  id: string;
  start: number;
  end: number;
  /** Display name: the session's own title, else its type ("Walking", "Weightlifting"). */
  title: string;
  kind: SessionKind;
  /** Health Connect's exercise type (for the session's icon). */
  type?: number;
  /** Distance recorded during the session, if any. */
  distanceM: number | null;
};

const KM = 1000;
const MILE = 1609.344;
/** Sessions shorter than this distance say little about pace. */
const MIN_PACE_DISTANCE_M = 300;
/** Below this many steps a stride figure is noise. */
const MIN_STRIDE_STEPS = 500;

/** Believable paces in seconds per km: walks 7-20 min/km, runs 2.5-10 min/km. */
const PLAUSIBLE = { walk: [7 * 60, 20 * 60], run: [150, 10 * 60] } as const;

export type ExercisePace = { secondsPerKm: number; kind: 'walk' | 'run' };

/**
 * Pace from walk and run sessions with a real distance: total time over total distance, runs
 * taking precedence when there are any (a run's pace is the one worth knowing). Null without.
 */
export function paceFrom(sessions: readonly ExerciseSessionInfo[]): ExercisePace | null {
  for (const kind of ['run', 'walk'] as const) {
    const usable = sessions.filter(
      (s) => s.kind === kind && (s.distanceM ?? 0) >= MIN_PACE_DISTANCE_M && s.end > s.start,
    );
    if (!usable.length) continue;
    const seconds = usable.reduce((a, s) => a + (s.end - s.start) / 1000, 0);
    const km = usable.reduce((a, s) => a + s.distanceM! / KM, 0);
    const secondsPerKm = seconds / km;
    // A session with long stops gives a pace nobody walks or runs: say nothing rather than that.
    const [fast, slow] = PLAUSIBLE[kind];
    if (secondsPerKm >= fast && secondsPerKm <= slow) return { secondsPerKm, kind };
  }
  return null;
}

/** Metres per step for the day, when there are enough steps to say. */
export function strideM(steps: number | null, distanceM: number | null): number | null {
  if (steps == null || distanceM == null || steps < MIN_STRIDE_STEPS || distanceM <= 0) return null;
  return distanceM / steps;
}

/** "5.2 km" or "3.2 mi" (one decimal under 100). */
export function formatDistance(metres: number, miles: boolean): string {
  const value = metres / (miles ? MILE : KM);
  return `${value < 100 ? value.toFixed(1) : Math.round(value)} ${miles ? 'mi' : 'km'}`;
}

/** "9:40 /km" or "15:33 /mi". */
export function formatPace(secondsPerKm: number, miles: boolean): string {
  const total = Math.round(secondsPerKm * (miles ? MILE / KM : 1));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')} /${miles ? 'mi' : 'km'}`;
}

/** "72 cm" or "28 in". */
export function formatStride(metres: number, miles: boolean): string {
  return miles ? `${Math.round(metres * 39.37)} in` : `${Math.round(metres * 100)} cm`;
}

/** "32 min" or "1 h 05 min". */
export function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-GB');
/** Steps a person walks in a minute at an easy pace. */
const STEPS_PER_MINUTE = 100;

/**
 * The one line under the mountain: how far to the top and the walk that gets there, or that the
 * summit is reached. Null steps means there's no source yet.
 */
export function climbLine(steps: number | null, goal: number): string {
  if (steps == null) return 'Connect Health Connect to start the climb.';
  if (steps >= goal) {
    const over = steps - goal;
    return over >= 100 ? `Summit reached, ${fmt(over)} steps past it.` : 'Summit reached.';
  }
  const left = goal - steps;
  const minutes = Math.max(5, Math.round(left / STEPS_PER_MINUTE / 5) * 5);
  return `${fmt(left)} steps to the top. A ${minutes}-minute walk gets you there.`;
}
