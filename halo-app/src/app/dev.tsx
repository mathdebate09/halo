import { ScrollView, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedScreen } from '@/components/themed-screen';
import { AdvisorRow } from '@/dev/advisor-row';
import { AssistantRow } from '@/dev/assistant-row';
import { FakeReadingRow } from '@/dev/fake-reading-row';
import { ModuleProbes } from '@/dev/module-probes';
import { NotifyPlanRow } from '@/dev/notify-plan-row';
import { OnboardingRow } from '@/dev/onboarding-row';
import { OverlayRow } from '@/dev/overlay-row';
import { ScreenTimeRow } from '@/dev/screen-time-row';
import { StoreRow } from '@/dev/store-row';
import { SyncRow } from '@/dev/sync-row';
import { ThemesRow } from '@/dev/themes-row';
import { TodayRow } from '@/dev/today-row';
import { VitalsRow } from '@/dev/vitals-row';

// Hidden developer screen: one row per native module from the batch build, each with a manual
// probe. Kept for demo mode later; not part of the product UI. Each row lives in src/dev/.

export default function DevScreen() {
  const insets = useSafeAreaInsets();
  return (
    <ThemedScreen>
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 pb-32"
        contentContainerStyle={{ paddingTop: insets.top + 12 }}>
        <Text className="mb-4 font-serif text-[40px] text-text">Native modules</Text>

        <OnboardingRow />
        <ThemesRow />
        <TodayRow />
        <FakeReadingRow />
        <OverlayRow />
        <AssistantRow />
        <VitalsRow />
        <AdvisorRow />
        <NotifyPlanRow />
        <ScreenTimeRow />
        <StoreRow />
        <SyncRow />
        <ModuleProbes />
      </ScrollView>
    </ThemedScreen>
  );
}
