import { Tabs } from 'expo-router/tabs';

import { Dock } from '@/components/dock';
import { TodayScoresProvider } from '@/today/today-scores';

export default function TabsLayout() {
  return (
    <TodayScoresProvider>
      <Tabs
        tabBar={(props) => <Dock {...props} />}
        // Back from History returns to the logger, not to Today.
        backBehavior="history"
        screenOptions={{
          headerShown: false,
          // Tabs are peers: no transition between them.
          animation: 'none',
          sceneStyle: { backgroundColor: 'transparent' },
        }}>
        <Tabs.Screen name="index" />
        <Tabs.Screen name="exercise" />
        <Tabs.Screen name="vitals" />
        {/* The Meal Logger section and its History, reached through the dock's plus. */}
        <Tabs.Screen name="log" />
        <Tabs.Screen name="history" />
      </Tabs>
    </TodayScoresProvider>
  );
}
