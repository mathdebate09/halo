import { Text, View } from 'react-native';

import { CheckIcon } from '@/components/icons';
import { PressScale } from '@/components/press-scale';
import { askOverlayAccess, useOverlayAccess } from '@/overlay/access';
import { useHaloTheme } from '@/theme/theme-provider';

/**
 * The floating ring over other apps, asked here in context like Usage access. The switch lives in
 * Settings, so the card re-checks when the user comes back.
 */
export function OverlayCard() {
  const { theme } = useHaloTheme();
  const access = useOverlayAccess();
  if (access === 'unavailable') return null;

  return (
    <View className="mt-3 flex-row items-center rounded-card border border-hairline/10 bg-glass/5 p-4">
      <View className="flex-1 pr-3">
        <Text className="font-sans-medium text-[16px] text-text">Keep Halo on screen</Text>
        <Text className="mt-0.5 font-sans text-[14px] leading-[20px] text-muted">
          Your scores and the next step, over other apps.
        </Text>
      </View>
      {access === 'granted' ? (
        <View
          className="flex-row items-center"
          accessibilityLabel="Display over other apps allowed">
          <CheckIcon size={18} color={theme.colors.text} />
          <Text className="ml-1.5 font-sans-medium text-[15px] text-text">Allowed</Text>
        </View>
      ) : (
        <PressScale
          accessibilityRole="button"
          accessibilityHint="Opens Display over other apps in Settings"
          onPress={askOverlayAccess}
          className="rounded-pill bg-glass/10 px-4 py-2">
          <Text className="font-sans-medium text-[15px] text-text">Allow</Text>
        </PressScale>
      )}
    </View>
  );
}
