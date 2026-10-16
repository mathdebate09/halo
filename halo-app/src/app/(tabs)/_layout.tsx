import { Tabs } from 'expo-router/tabs';

import { AdvisorSourcesPublisher } from '@/advisor/sources';
import { AssistantProvider } from '@/assistant/assistant';
import { Dock } from '@/components/dock';
import { TodayScoresProvider } from '@/today/today-scores';

export default function TabsLayout() {
  return (
    <TodayScoresProvider>
      <AssistantProvider>
        {/* Keeps the Advisor's snapshot sources current (it opens above the tabs). */}
        <AdvisorSourcesPublisher />
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
      </AssistantProvider>
    </TodayScoresProvider>
  );
}
