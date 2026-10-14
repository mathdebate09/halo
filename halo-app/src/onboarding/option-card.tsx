import { Text, View } from 'react-native';

import { CheckIcon } from '@/components/icons';
import { PressScale } from '@/components/press-scale';
import { useHaloTheme } from '@/theme/theme-provider';

type Props = {
  label: string;
  detail?: string;
  selected: boolean;
  onPress: () => void;
  /** Multi-select lists read as checkboxes, single-select as radios. */
  multi?: boolean;
};

/** A glass choice card; the selected state fades in (150ms) with an accent edge and a check. */
export function OptionCard({ label, detail, selected, onPress, multi }: Props) {
  const { theme } = useHaloTheme();
  return (
    <PressScale
      accessibilityRole={multi ? 'checkbox' : 'radio'}
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      onPress={onPress}
      className={`flex-row items-center rounded-[22px] border px-5 py-[18px] ${
        selected ? 'border-accent/70 bg-accent/15' : 'border-hairline/10 bg-glass/[0.07]'
      }`}
      style={{
        transitionProperty: ['backgroundColor', 'borderColor'],
        transitionDuration: 150,
        transitionTimingFunction: 'ease-out',
      }}>
      <View className="flex-1 pr-3">
        <Text className="font-sans-medium text-[17px] text-text">{label}</Text>
        {detail ? <Text className="mt-1 font-sans text-[14px] text-muted">{detail}</Text> : null}
      </View>
      <View
        className={`h-7 w-7 items-center justify-center rounded-full border ${
          selected ? 'border-accent bg-accent' : 'border-hairline/25'
        }`}>
        {selected ? <CheckIcon size={18} color={theme.colors.onAccent} /> : null}
      </View>
    </PressScale>
  );
}
