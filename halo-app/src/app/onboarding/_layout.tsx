import { Stack } from 'expo-router';

import { ThemedScreen } from '@/components/themed-screen';
import { ProgressHeader } from '@/onboarding/progress-header';
import { useHaloTheme } from '@/theme/theme-provider';

/**
 * Each step paints its own opaque theme background: during a native transition both screens are
 * on screen, so a transparent step would show the previous one through it. The progress header
 * sits above the stack and doesn't move.
 */
export default function OnboardingLayout() {
  const { theme } = useHaloTheme();
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
