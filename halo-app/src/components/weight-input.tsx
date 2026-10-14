import { useRef } from 'react';
import { View } from 'react-native';

import { useUnits } from '@/lib/units';
import { clamp, displayWeight, type WeightUnit, weightToKg } from '@/shared';

import { NumberField, type NumberFieldHandle } from './number-field';
import { type RulerScale, RulerPicker } from './ruler-picker';
import { SegmentedToggle } from './segmented-toggle';

const SCALES: Record<WeightUnit, RulerScale> = {
  kg: { min: 30, max: 250, step: 0.1, ticksPerMajor: 10, formatMajor: (v) => `${Math.round(v)}` },
  lb: { min: 66, max: 551, step: 0.1, ticksPerMajor: 10, formatMajor: (v) => `${Math.round(v)}` },
};
const UNIT_OPTIONS = [
  { id: 'kg' as const, label: 'kg' },
  { id: 'lb' as const, label: 'lb' },
];

/** Weight in kg in, kg out; shown in the app-wide unit. Number, unit tabs and a horizontal dial. */
export function WeightInput({ kg, onChangeKg }: { kg: number; onChangeKg: (kg: number) => void }) {
  const [units, setUnits] = useUnits();
  const unit = units.weight;
  const scale = SCALES[unit];
  const display = clamp(displayWeight(kg, unit), scale.min, scale.max);
  const set = (value: number) => onChangeKg(weightToKg(value, unit));
  const field = useRef<NumberFieldHandle>(null);

  return (
    <View className="items-center gap-6">
      <NumberField
        ref={field}
        value={display}
        decimals={1}
        min={scale.min}
        max={scale.max}
        onChange={set}
        unit={unit}
        accessibilityLabel={`Weight in ${unit === 'kg' ? 'kilograms' : 'pounds'}`}
      />
      <SegmentedToggle
        accessibilityLabel="Weight unit"
        options={UNIT_OPTIONS}
        value={unit}
        onChange={(weight) => setUnits({ weight })}
      />
      <RulerPicker
        key={unit}
        scale={scale}
        value={display}
        onChange={set}
        onLive={(v) => field.current?.showLive(v)}
        orientation="horizontal"
        accessibilityLabel="Weight ruler"
        accessibilityValueText={(v) => `${v} ${unit === 'kg' ? 'kilograms' : 'pounds'}`}
      />
    </View>
  );
}
