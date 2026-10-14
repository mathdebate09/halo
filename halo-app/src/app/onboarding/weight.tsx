import { useState } from 'react';
import { View } from 'react-native';

import { PrimaryButton } from '@/components/button';
import { WeightInput } from '@/components/weight-input';
import { goNext, useStepFocus } from '@/onboarding/navigation';
import { OnboardingScreen } from '@/onboarding/onboarding-screen';
import { setAnswers, useOnboarding } from '@/onboarding/state';
import { clamp, round, WEIGHT_RANGE_KG } from '@/shared';

// scr 11: horizontal dial. Starts from Health Connect, then the last answer, then a default.

export default function WeightStep() {
  useStepFocus('weight');
  const { answers } = useOnboarding();
  const [kg, setKg] = useState(() =>
    clamp(
      answers.weightKg ?? answers.healthConnect?.weightKg ?? (answers.sex === 'male' ? 80 : 65),
      WEIGHT_RANGE_KG.min,
      WEIGHT_RANGE_KG.max,
    ),
  );

  return (
    <OnboardingScreen
      scroll={false}
      title="What do you weigh now?"
      footer={
        <PrimaryButton
          label="Next"
          onPress={() => {
            setAnswers({ weightKg: round(kg, 1) });
            goNext('weight');
          }}
        />
      }>
      <View className="flex-1 justify-center pb-10">
        <WeightInput kg={kg} onChangeKg={setKg} />
      </View>
    </OnboardingScreen>
  );
}
