import { Tabs } from 'expo-router/tabs';

import { Dock } from '@/components/dock';

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <Dock {...props} />}
      screenOptions={{
        headerShown: false,
        // Tabs are peers: no transition between them.
        animation: 'none',
        sceneStyle: { backgroundColor: 'transparent' },
      }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="exercise" />
      <Tabs.Screen name="vitals" />
    </Tabs>
  );
}
