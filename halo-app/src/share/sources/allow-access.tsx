import { Text, View } from 'react-native';

import { PressScale } from '@/components/press-scale';

/** A source without its permission: one line and the button that asks again. */
export function AllowAccess({
  line,
  button,
  onAllow,
}: {
  line: string;
  button: string;
  onAllow: () => void;
}) {
  return (
    <View className="flex-1 items-center px-8 pt-16">
      <Text className="text-center font-sans text-[16px] text-text/70">{line}</Text>
      <PressScale
        accessibilityRole="button"
        onPress={onAllow}
        className="mt-6 rounded-pill bg-glass/10 px-8 py-3.5">
        <Text className="font-sans-medium text-[16px] text-text">{button}</Text>
      </PressScale>
    </View>
  );
}
