import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { PressScale } from '@/components/press-scale';
import { formatLabNumber, parseValue, type RangeState } from '@/shared';
import { useHaloTheme } from '@/theme/theme-provider';

/**
 * One value from a report, for any analyte: its name, the number (tap to fix it), and one short
 * line: where it sits ("In range", tinted), the expected values ("13–17") and the previous
 * report's value ("was 12.6 in Mar"). Rows without `onEdit` (all results) are read-only.
 */
export function ReviewRow({
  label,
  value,
  qualifier,
  unit,
  state,
  stateWord,
  expected,
  trend,
  onEdit,
}: {
  label: string;
  value: number;
  qualifier: '<' | '>' | null;
  unit: string | null;
  state: RangeState | null;
  stateWord: string | null;
  expected: string | null;
  trend?: string | null;
  onEdit?: (value: number) => void;
}) {
  const { theme } = useHaloTheme();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const shown = `${qualifier ?? ''}${formatLabNumber(value)}`;
  const tint =
    state === 'inside'
      ? theme.colors.steady
      : state
        ? theme.colors.opportunity
        : theme.colors.muted;

  const rest = [expected, trend].filter(Boolean).join(' · ');

  const commit = () => {
    setEditing(false);
    const parsed = parseValue(draft);
    if (parsed && onEdit) onEdit(parsed.value);
  };

  return (
    <View className="flex-row items-start rounded-[20px] bg-glass/5 px-4 py-3">
      <View className="flex-1 pr-3">
        <Text className="font-sans text-[16px] text-text">{label}</Text>
        {stateWord || expected || trend ? (
          <Text className="mt-0.5 font-sans text-[14px] text-muted">
            {stateWord ? <Text style={{ color: tint }}>{stateWord}</Text> : null}
            {stateWord && rest ? ' · ' : ''}
            {rest}
          </Text>
        ) : null}
      </View>
      {editing ? (
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onEndEditing={commit}
          onSubmitEditing={commit}
          autoFocus
          selectTextOnFocus
          keyboardType="decimal-pad"
          returnKeyType="done"
          accessibilityLabel={`${label} value`}
          className="min-w-[72px] rounded-xl bg-glass/10 px-3 py-1 text-right font-serif text-[22px] text-text"
        />
      ) : (
        <PressScale
          accessibilityRole={onEdit ? 'button' : 'text'}
          accessibilityLabel={`${label}, ${shown}${unit ? ` ${unit}` : ''}${onEdit ? '. Tap to fix it' : ''}`}
          disabled={!onEdit}
          onPress={() => {
            setDraft(formatLabNumber(value));
            setEditing(true);
          }}
          className="items-end">
          <Text className="font-serif text-[22px] leading-[28px] text-text">{shown}</Text>
          {unit ? <Text className="font-sans text-[12px] text-muted">{unit}</Text> : null}
        </PressScale>
      )}
    </View>
  );
}
