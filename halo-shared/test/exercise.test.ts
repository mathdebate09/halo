import { describe, expect, it } from 'vitest';

import {
  type ExerciseSessionInfo,
  formatDistance,
  formatDuration,
  formatPace,
  formatStride,
  paceFrom,
  strideM,
  climbLine,
} from '../src/exercise';

const session = (kind: ExerciseSessionInfo['kind'], minutes: number, distanceM: number | null): ExerciseSessionInfo => ({
  id: `${kind}${minutes}`,
  start: 0,
  end: minutes * 60_000,
  title: kind,
  kind,
  distanceM,
});

describe('pace', () => {
  it('is total time over total distance of walks', () => {
    expect(paceFrom([session('walk', 30, 3000), session('walk', 20, 2000)])).toEqual({
      secondsPerKm: 600,
      kind: 'walk',
    });
  });
  it('prefers runs when there are any', () => {
    expect(paceFrom([session('walk', 30, 3000), session('run', 25, 5000)])?.kind).toBe('run');
  });
  it('says nothing when stops make the pace unbelievable', () => {
    expect(paceFrom([session('walk', 90, 3000)])).toBeNull();
    expect(paceFrom([session('run', 60, 3000), session('walk', 30, 3000)])?.kind).toBe('walk');
  });
  it('ignores sessions without a real distance, and other kinds', () => {
    expect(paceFrom([session('walk', 30, 100), session('ride', 30, 10000), session('other', 40, null)])).toBeNull();
  });
});

describe('stride', () => {
  it('is metres per step with enough steps', () => {
    expect(strideM(8000, 5600)).toBeCloseTo(0.7);
    expect(strideM(300, 200)).toBeNull();
    expect(strideM(8000, null)).toBeNull();
  });
});

describe('formats', () => {
  it('distance in km or miles', () => {
    expect(formatDistance(5200, false)).toBe('5.2 km');
    expect(formatDistance(5200, true)).toBe('3.2 mi');
  });
  it('pace per km or mile', () => {
    expect(formatPace(580, false)).toBe('9:40 /km');
    expect(formatPace(580, true)).toBe('15:33 /mi');
  });
  it('stride and duration', () => {
    expect(formatStride(0.72, false)).toBe('72 cm');
    expect(formatStride(0.72, true)).toBe('28 in');
    expect(formatDuration(32 * 60_000)).toBe('32 min');
    expect(formatDuration(65 * 60_000)).toBe('1 h 05 min');
  });
});

describe('climb line', () => {
  it('says how far, and the walk that covers it', () => {
    expect(climbLine(7160, 9000)).toBe('1,840 steps to the top. A 20-minute walk gets you there.');
    expect(climbLine(8900, 9000)).toBe('100 steps to the top. A 5-minute walk gets you there.');
  });
  it('marks the summit, and how far past it', () => {
    expect(climbLine(9050, 9000)).toBe('Summit reached.');
    expect(climbLine(14537, 9000)).toBe('Summit reached, 5,537 steps past it.');
  });
  it('asks for a source when there is none', () => {
    expect(climbLine(null, 9000)).toBe('Connect Health Connect to start the climb.');
  });
});
