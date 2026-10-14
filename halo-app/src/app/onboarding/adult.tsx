import { router } from 'expo-router';

import { PrimaryButton } from '@/components/button';
import { OnboardingScreen } from '@/onboarding/onboarding-screen';

// Off-flow gentle stop for under-18s (SPEC scr 9 ▸). Not a step: no progress header.

export default function AdultGate() {
  return (
    <OnboardingScreen
      title="Halo’s plans are for adults"
      subtitle="If that birthday was a slip, you can change it."
      footer={<PrimaryButton label="Change my birthday" onPress={() => router.back()} />}
    />
  );
}
