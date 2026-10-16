import '../global.css';

import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { setupNotifications, useNotificationResponses } from '@/assistant/notify';
import { LaunchSequence } from '@/components/launch-sequence';
import { ToastHost } from '@/components/toast';
import { DataGate } from '@/db/data-gate';
import { useOnboarded } from '@/onboarding/state';
import { HaloThemeProvider, useHaloTheme } from '@/theme/theme-provider';

// Fonts are embedded at build time by the expo-font config plugin (app.json), so nothing loads here.
// The native splash stays until LaunchSequence has mounted an identical frame.
SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { theme } = useHaloTheme();
  const onboarded = useOnboarded();
  useNotificationResponses();
  useEffect(() => {
    // Channels, buttons and the background action task; failures only cost the push path.
    setupNotifications().catch(() => {});
  }, []);
  const navigationTheme = {
    ...DarkTheme,
    colors: { ...DarkTheme.colors, background: theme.colors.bg, card: theme.colors.bg },
  };
  return (
    <ThemeProvider value={navigationTheme}>
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.bg } }}>
        {/* Until onboarding completes only its flow is reachable; finishing flips to Today. */}
        {/* Onboarding ↔ tabs swap with a fade, not a slide: the finale and Today share a hero. */}
        <Stack.Protected guard={onboarded}>
          <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
          <Stack.Screen
            name="weigh-in"
            options={{
              presentation: 'transparentModal',
              animation: 'fade',
              contentStyle: { backgroundColor: 'transparent' },
            }}
          />
          <Stack.Screen
            name="wake-time"
            options={{
              presentation: 'transparentModal',
              animation: 'fade',
              contentStyle: { backgroundColor: 'transparent' },
            }}
          />
          <Stack.Screen
            name="sleep-hours"
            options={{
              presentation: 'transparentModal',
              animation: 'fade',
              contentStyle: { backgroundColor: 'transparent' },
            }}
          />
          <Stack.Screen
            name="report-password"
            options={{
              presentation: 'transparentModal',
              animation: 'fade',
              contentStyle: { backgroundColor: 'transparent' },
            }}
          />
          <Stack.Screen
            name="meal/[id]"
            options={{
              presentation: 'transparentModal',
              animation: 'fade',
              contentStyle: { backgroundColor: 'transparent' },
            }}
          />
          <Stack.Screen name="report/[id]" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="reports" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="advisor" />
          <Stack.Screen name="share" options={{ animation: 'slide_from_bottom' }} />
        </Stack.Protected>
        <Stack.Protected guard={!onboarded}>
          <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
        </Stack.Protected>
        <Stack.Screen name="dev" />
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.fill}>
      <HaloThemeProvider>
        <DataGate>
          <RootNavigator />
          <ToastHost />
          <LaunchSequence />
        </DataGate>
      </HaloThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
