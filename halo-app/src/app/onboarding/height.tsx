import { useState } from 'react';

import { PrimaryButton } from '@/components/button';
import { HeightInput } from '@/components/height-input';
import { goNext, useStepFocus } from '@/onboarding/navigation';
import { OnboardingScreen } from '@/onboarding/onboarding-screen';
import { setAnswers, useOnboarding } from '@/onboarding/state';
import { clamp, HEIGHT_RANGE_CM } from '@/shared';

// scr 10: vertical ruler. Starts from Health Connect, then the last answer, then a default.

export default function HeightStep() {
  useStepFocus('height');
  const { answers } = useOnboarding();
  const [cm, setCm] = useState(() =>
    clamp(
      answers.heightCm ?? answers.healthConnect?.heightCm ?? (answers.sex === 'male' ? 177 : 163),
      HEIGHT_RANGE_CM.min,
      HEIGHT_RANGE_CM.max,
    ),
  );

  return (
    <OnboardingScreen
      scroll={false}
      title="How tall are you?"
      footer={
        <PrimaryButton
          label="Next"
          onPress={() => {
            setAnswers({ heightCm: Math.round(cm) });
            goNext('height');
          }}
        />
      }>
      <HeightInput cm={cm} onChangeCm={setCm} />
    </OnboardingScreen>
  );
}
