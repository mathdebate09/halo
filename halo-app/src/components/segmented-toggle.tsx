import { Text, View } from 'react-native';

import { PressScale } from './press-scale';

type Option<T extends string> = { id: T; label: string };

/** Unit tabs (kg / lb, cm / ft·in): a glass track with the active option as a light pill. */
export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
}) {
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      className="flex-row self-center rounded-pill bg-glass/10 p-1">
      {options.map((option) => {
        const active = option.id === value;
        return (
          <PressScale
            key={option.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.id)}
            className={`rounded-pill px-5 py-2 ${active ? 'bg-text' : ''}`}
            style={{ transitionProperty: 'backgroundColor', transitionDuration: 150 }}>
            <Text className={`font-sans-medium text-[14px] ${active ? 'text-bg' : 'text-text/70'}`}>
              {option.label}
            </Text>
          </PressScale>
        );
      })}
    </View>
  );
}
