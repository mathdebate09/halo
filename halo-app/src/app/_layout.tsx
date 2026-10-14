import '../global.css';

import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { HaloThemeProvider } from '@/theme/theme-provider';

// Fonts are embedded at build time by the expo-font config plugin (app.json), so nothing loads here.
SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <HaloThemeProvider>
        <AnimatedSplashOverlay />
        <AppTabs />
      </HaloThemeProvider>
    </ThemeProvider>
  );
}
