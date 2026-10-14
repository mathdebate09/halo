import { type Ref, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { useHaloTheme } from '@/theme/theme-provider';

export type NumberFieldHandle = {
  /** Shows a value while a ruler is moving, without touching parent state. */
  showLive: (value: number) => void;
};

type Props = {
  ref?: Ref<NumberFieldHandle>;
  value: number;
  decimals: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  unit: string;
  accessibilityLabel: string;
  /** Visual size of the numeral. */
  size?: 'large' | 'medium';
};

const format = (v: number, decimals: number) => v.toFixed(decimals);

/**
 * The big serif number above a ruler. Typing a valid value moves the ruler; the ruler moves the
 * text unless the field is focused. Out-of-range or unparsable text reverts on blur.
 */
export function NumberField({
  ref,
  value,
  decimals,
  min,
  max,
  onChange,
  unit,
  accessibilityLabel,
  size = 'large',
}: Props) {
  const { theme } = useHaloTheme();
  const [text, setText] = useState(format(value, decimals));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(format(value, decimals));
  }, [value, decimals]);

  useImperativeHandle(ref, () => ({
    showLive: (v: number) => {
      if (!focused.current) setText(format(v, decimals));
    },
  }));

  const parse = (raw: string) => {
    const n = Number(raw.replace(',', '.'));
    return raw.trim() !== '' && Number.isFinite(n) && n >= min && n <= max ? n : null;
  };

  return (
    <View className="flex-row items-baseline justify-center">
      <TextInput
        accessibilityLabel={accessibilityLabel}
        value={text}
        onChangeText={(raw) => {
          setText(raw);
          const n = parse(raw);
          if (n != null) onChange(Number(n.toFixed(decimals)));
        }}
        onFocus={() => {
          focused.current = true;
        }}
        onBlur={() => {
          focused.current = false;
          if (parse(text) == null) setText(format(value, decimals));
          else setText(format(Number(text.replace(',', '.')), decimals));
        }}
        keyboardType="decimal-pad"
        selectTextOnFocus
        maxLength={6}
        selectionColor={theme.colors.accent}
        className={`p-0 text-center font-serif text-text ${size === 'large' ? 'text-[88px]' : 'text-[64px]'}`}
      />
      <Text className="ml-2 font-sans text-[18px] text-muted">{unit}</Text>
    </View>
  );
}
