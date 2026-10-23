import { router } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';

import { PressScale } from '@/components/press-scale';
import { useHaloTheme } from '@/theme/theme-provider';

/** Opens the composer with a background that is already a local, upright JPEG. */
export function compose(photo: { uri: string; width: number; height: number }) {
  router.push({
    pathname: '/share/compose',
    params: { uri: photo.uri, w: String(photo.width), h: String(photo.height) },
  });
}

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

/** The spinner over a tile while its background is being prepared. */
export function BusyOverlay() {
  const { theme } = useHaloTheme();
  return (
    <View className="absolute inset-0 items-center justify-center bg-black/40">
      <ActivityIndicator color={theme.colors.text} />
    </View>
  );
}
