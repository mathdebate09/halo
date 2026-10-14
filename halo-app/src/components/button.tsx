import { Text } from 'react-native';

import { PressScale } from './press-scale';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityHint?: string;
};

/** The one solid action on a screen: a light pill (Oura's primary). */
export function PrimaryButton({ label, onPress, disabled, accessibilityHint }: Props) {
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`h-14 items-center justify-center rounded-pill bg-text ${disabled ? 'opacity-40' : ''}`}>
      <Text className="font-sans-medium text-[17px] text-bg">{label}</Text>
    </PressScale>
  );
}

/** Secondary action under a primary one: text only. */
export function QuietButton({ label, onPress, disabled }: Props) {
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      className="h-12 items-center justify-center">
      <Text className="font-sans-medium text-[16px] text-text/75">{label}</Text>
    </PressScale>
  );
}
