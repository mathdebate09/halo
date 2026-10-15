import { Stack } from 'expo-router';

import { useHaloTheme } from '@/theme/theme-provider';

/** Share: Select background → composer. Outside the tabs, so the dock stays out of the way. */
export default function ShareLayout() {
  const { theme } = useHaloTheme();
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.bg } }}
    />
  );
}
