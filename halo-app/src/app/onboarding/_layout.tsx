import { Stack } from 'expo-router';
import { useEffect } from 'react';

import { ThemedScreen } from '@/components/themed-screen';
import { ProgressHeader } from '@/onboarding/progress-header';
import { useHaloTheme } from '@/theme/theme-provider';
import { DEFAULT_THEME_ID } from '@/theme/themes';

/**
 * Each step paints its own opaque theme background: during a native transition both screens are
 * on screen, so a transparent step would show the previous one through it. The progress header
 * sits above the stack and doesn't move.
 */
export default function OnboardingLayout() {
  const { theme, setThemeId } = useHaloTheme();
  // Onboarding always runs in high-2, the intro's own hero (also after a reset). The plan step
  // then picks the day's high-tier variant.
  useEffect(() => {
    if (!theme.id.startsWith('high')) setThemeId(DEFAULT_THEME_ID);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on entering onboarding
  }, []);
  return (
    <ThemedScreen>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.bg },
        }}
      />
      <ProgressHeader />
    </ThemedScreen>
  );
}
