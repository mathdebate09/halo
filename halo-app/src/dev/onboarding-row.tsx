import { router } from 'expo-router';

import { Btn, Row } from '@/dev/ui';
import { resetOnboarding, useOnboarding } from '@/onboarding/state';

export function OnboardingRow() {
  const state = useOnboarding();
  return (
    <Row
      title="Onboarding"
      status={[
        state.completedAt
          ? `completed ${new Date(state.completedAt).toLocaleString()}`
          : `in progress at "${state.step}"`,
        `answers: ${JSON.stringify(state.answers)}`,
      ].join('\n')}>
      <Btn
        label="Reset onboarding"
        onPress={() => {
          resetOnboarding();
          router.replace('/onboarding');
        }}
      />
    </Row>
  );
}
