import { useEffect, useState } from 'react';
import { AppState, Text, View } from 'react-native';

import { openUsageAccess, refreshScreenNights, usageAccess } from '@/assistant/screen';
import { CheckIcon } from '@/components/icons';
import { PressScale } from '@/components/press-scale';
import { useHaloTheme } from '@/theme/theme-provider';

/**
 * No sleep tracker? Usage access lets Halo read when the screen went dark overnight. The toggle
 * lives in Settings, so the card re-checks when the user comes back.
 */
export function ScreenTimeCard() {
  const { theme } = useHaloTheme();
  const [access, setAccess] = useState(usageAccess);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const now = usageAccess();
      setAccess(now);
      if (now === 'granted') refreshScreenNights(true);
    });
    return () => sub.remove();
  }, []);
  if (access === 'unavailable') return null;
  const granted = access === 'granted';

  return (
    <View className="mt-8 flex-row items-center rounded-card border border-hairline/10 bg-glass/5 p-4">
      <View className="flex-1 pr-3">
        <Text className="font-sans-medium text-[16px] text-text">No sleep tracker?</Text>
        <Text className="mt-0.5 font-sans text-[14px] leading-[20px] text-muted">
          Halo can read when your screen goes dark at night.
        </Text>
      </View>
      {granted ? (
        <View className="flex-row items-center" accessibilityLabel="Usage access allowed">
          <CheckIcon size={18} color={theme.colors.text} />
          <Text className="ml-1.5 font-sans-medium text-[15px] text-text">Allowed</Text>
        </View>
      ) : (
        <PressScale
          accessibilityRole="button"
          accessibilityHint="Opens Usage access in Settings"
          onPress={openUsageAccess}
          className="rounded-pill bg-glass/10 px-4 py-2 active:bg-glass/20">
          <Text className="font-sans-medium text-[15px] text-text">Allow</Text>
        </PressScale>
      )}
    </View>
  );
}
