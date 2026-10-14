import { describe, expect, it } from 'vitest';

import { addDays, dayKey, dayStart, hourOfDay } from '../src/day';
import {
  cmToFtIn,
  defaultUnits,
  displayWeight,
  ftInToCm,
  isPlausibleHeightCm,
  isPlausibleWeightKg,
  weightToKg,
} from '../src/units';

describe('units', () => {
  it('round-trips weight within display precision', () => {
    expect(displayWeight(65, 'lb')).toBe(143.3);
    expect(weightToKg(143.3, 'lb')).toBeCloseTo(65, 1);
    expect(displayWeight(65.04, 'kg')).toBe(65);
  });
  it('converts height', () => {
    expect(cmToFtIn(180)).toEqual({ ft: 5, in: 11 });
    expect(ftInToCm(5, 11)).toBeCloseTo(180.34);
    expect(cmToFtIn(182.88)).toEqual({ ft: 6, in: 0 });
  });
  it('validates plausible ranges', () => {
    expect(isPlausibleWeightKg(29.9)).toBe(false);
    expect(isPlausibleWeightKg(250)).toBe(true);
    expect(isPlausibleHeightCm(231)).toBe(false);
  });
  it('picks locale defaults', () => {
    expect(defaultUnits('metric')).toEqual({ weight: 'kg', height: 'cm' });
    expect(defaultUnits('us')).toEqual({ weight: 'lb', height: 'ftin' });
    expect(defaultUnits('uk')).toEqual({ weight: 'kg', height: 'ftin' });
    expect(defaultUnits(null)).toEqual({ weight: 'kg', height: 'cm' });
  });
});

describe('day key (4 am rollover)', () => {
  it('counts 03:59 as the previous day', () => {
    expect(dayKey(new Date(2026, 9, 14, 3, 59))).toBe('2026-10-13');
    expect(dayKey(new Date(2026, 9, 14, 4, 0))).toBe('2026-10-14');
  });
  it('rolls across month and year ends', () => {
    expect(dayKey(new Date(2027, 0, 1, 1, 0))).toBe('2026-12-31');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('starts a day at the rollover hour', () => {
    const start = dayStart('2026-10-14');
    expect([start.getHours(), start.getDate()]).toEqual([4, 14]);
  });
  it('reports fractional hours', () => {
    expect(hourOfDay(new Date(2026, 9, 14, 13, 30))).toBe(13.5);
  });
});
