import { useRef } from 'react';
import { View } from 'react-native';

import { useUnits } from '@/lib/units';
import { clamp, cmToFtIn, ftInToCm, type HeightUnit } from '@/shared';

import { NumberField, type NumberFieldHandle } from './number-field';
import { type RulerScale, RulerPicker } from './ruler-picker';
import { SegmentedToggle } from './segmented-toggle';

// Display scales: centimetres, or inches labelled in feet.
const SCALES: Record<HeightUnit, RulerScale> = {
  cm: { min: 120, max: 230, step: 1, ticksPerMajor: 10, formatMajor: (v) => `${v}` },
  ftin: { min: 48, max: 90, step: 1, ticksPerMajor: 12, formatMajor: (v) => `${v / 12}′` },
};
const UNIT_OPTIONS = [
  { id: 'cm' as const, label: 'cm' },
  { id: 'ftin' as const, label: 'ft · in' },
];

/** Height in cm in, cm out. Number field(s) and unit tabs beside a vertical ruler. */
export function HeightInput({ cm, onChangeCm }: { cm: number; onChangeCm: (cm: number) => void }) {
  const [units, setUnits] = useUnits();
  const unit = units.height;
  const scale = SCALES[unit];
  const inches = clamp(Math.round(cm / 2.54), scale.min, scale.max);
  const display = unit === 'cm' ? clamp(Math.round(cm), scale.min, scale.max) : inches;
  const { ft, in: inch } = cmToFtIn(cm);

  const fromDisplay = (value: number) => onChangeCm(unit === 'cm' ? value : value * 2.54);
  const cmField = useRef<NumberFieldHandle>(null);
  const ftField = useRef<NumberFieldHandle>(null);
  const inField = useRef<NumberFieldHandle>(null);
  const showLive = (v: number) => {
    if (unit === 'cm') cmField.current?.showLive(v);
    else {
      ftField.current?.showLive(Math.floor(v / 12));
      inField.current?.showLive(v % 12);
    }
  };

  return (
    <View className="flex-1 flex-row items-center">
      <View className="flex-1 items-center gap-6">
        {unit === 'cm' ? (
          <NumberField
            ref={cmField}
            value={display}
            decimals={0}
            min={scale.min}
            max={scale.max}
            onChange={fromDisplay}
            unit="cm"
            accessibilityLabel="Height in centimetres"
          />
        ) : (
          <View className="flex-row gap-4">
            <NumberField
              ref={ftField}
              size="medium"
              value={ft}
              decimals={0}
              min={3}
              max={7}
              onChange={(f) => onChangeCm(ftInToCm(f, inch))}
              unit="ft"
              accessibilityLabel="Height, feet"
            />
            <NumberField
              ref={inField}
              size="medium"
              value={inch}
              decimals={0}
              min={0}
              max={11}
              onChange={(i) => onChangeCm(ftInToCm(ft, i))}
              unit="in"
              accessibilityLabel="Height, inches"
            />
          </View>
        )}
        <SegmentedToggle
          accessibilityLabel="Height unit"
          options={UNIT_OPTIONS}
          value={unit}
          onChange={(height) => setUnits({ height })}
        />
      </View>
      <View className="h-[400px]">
        <RulerPicker
          key={unit}
          scale={scale}
          value={display}
          onChange={fromDisplay}
          onLive={showLive}
          orientation="vertical"
          accessibilityLabel="Height ruler"
          accessibilityValueText={(v) =>
            unit === 'cm' ? `${v} centimetres` : `${Math.floor(v / 12)} feet ${v % 12} inches`
          }
        />
      </View>
    </View>
  );
}
