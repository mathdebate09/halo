import { Stack } from 'expo-router';

import { useStatusBarStyle } from '@/theme/status-bar';
import { ImageScope, useHaloTheme } from '@/theme/theme-provider';
import { themes } from '@/theme/themes';

/**
 * Share: Select background → composer. Outside the tabs, so the dock stays out of the way. A photo
 * editor, so it keeps the theme's dark tokens in either mode.
 */
export default function ShareLayout() {
  const { theme } = useHaloTheme();
  useStatusBarStyle('light');
  return (
    <ImageScope style={{ flex: 1 }}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: themes[theme.id].colors.bg },
        }}
      />
    </ImageScope>
  );
}
