import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { PressScale } from '@/components/press-scale';
import { formatLabNumber, parseValue, type RangeState } from '@/shared';
import { useHaloTheme } from '@/theme/theme-provider';

/**
 * One value from a report, for any analyte: its name (and the printed name when it differs), the
 * number as printed (tap to fix it), where it sits against the range in words, and a note when the
 * reading needs a look. Read-only rows (a confirmed report, all results) drop the editing.
 */
export function ReviewRow({
  label,
  rawName,
  value,
  qualifier,
  unit,
  words,
  state,
  note,
  onEdit,
}: {
  label: string;
  rawName?: string | null;
  value: number;
  qualifier: '<' | '>' | null;
  unit: string | null;
  words: string | null;
  state: RangeState | null;
  note?: string | null;
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

  const commit = () => {
    setEditing(false);
    const parsed = parseValue(draft);
    if (parsed && onEdit) onEdit(parsed.value);
  };

  return (
    <View className="flex-row items-start rounded-[20px] bg-glass/5 px-4 py-3">
      <View className="flex-1 pr-3">
        <Text className="font-sans text-[16px] text-text">{label}</Text>
        {rawName ? (
          <Text className="font-sans text-[13px] text-muted">Printed as {rawName}</Text>
        ) : null}
        {words ? (
          <Text className="mt-0.5 font-sans text-[14px]" style={{ color: tint }}>
            {words}
          </Text>
        ) : null}
        {note ? (
          <Text
            className="mt-0.5 font-sans-medium text-[13px]"
            style={{ color: theme.colors.opportunity }}>
            {note}
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
