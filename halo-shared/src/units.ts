// Unit conversion and validation. Everything is stored metric (kg, cm); units are display only.

export type WeightUnit = 'kg' | 'lb';
export type HeightUnit = 'cm' | 'ftin';
export type Units = { weight: WeightUnit; height: HeightUnit };

const LB_PER_KG = 2.2046226218;
const CM_PER_IN = 2.54;

export const WEIGHT_RANGE_KG = { min: 30, max: 250 } as const;
export const HEIGHT_RANGE_CM = { min: 120, max: 230 } as const;

export const round = (value: number, decimals = 0) => {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
};

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const kgToLb = (kg: number) => kg * LB_PER_KG;
export const lbToKg = (lb: number) => lb / LB_PER_KG;

export function cmToFtIn(cm: number): { ft: number; in: number } {
  const totalIn = Math.round(cm / CM_PER_IN);
  return { ft: Math.floor(totalIn / 12), in: totalIn % 12 };
}

export const ftInToCm = (ft: number, inches: number) => (ft * 12 + inches) * CM_PER_IN;

/** Weight in the display unit, 0.1 precision. */
export const displayWeight = (kg: number, unit: WeightUnit) =>
  round(unit === 'kg' ? kg : kgToLb(kg), 1);

/** Display value back to kg. */
export const weightToKg = (value: number, unit: WeightUnit) =>
  unit === 'kg' ? value : lbToKg(value);

export const isPlausibleWeightKg = (kg: number) =>
  kg >= WEIGHT_RANGE_KG.min && kg <= WEIGHT_RANGE_KG.max;
export const isPlausibleHeightCm = (cm: number) =>
  cm >= HEIGHT_RANGE_CM.min && cm <= HEIGHT_RANGE_CM.max;

/** Default units from the device locale's measurement system (expo-localization). */
export function defaultUnits(measurementSystem: 'metric' | 'us' | 'uk' | null | undefined): Units {
  if (measurementSystem === 'us') return { weight: 'lb', height: 'ftin' };
  // UK weighs in stone (out of scope) or kg, and measures height in ft/in.
  if (measurementSystem === 'uk') return { weight: 'kg', height: 'ftin' };
  return { weight: 'kg', height: 'cm' };
}
