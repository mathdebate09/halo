import { useState } from 'react';
import { Text, View } from 'react-native';

import { PrimaryButton } from '@/components/button';
import { WeightInput } from '@/components/weight-input';
import { useUnits } from '@/lib/units';
import { goNext, useStepFocus } from '@/onboarding/navigation';
import { OnboardingScreen } from '@/onboarding/onboarding-screen';
import { setAnswers, useOnboarding } from '@/onboarding/state';
import { displayWeight, minHealthyWeightKg, round } from '@/shared';

// scr 12: the target, same dial and unit. Skipped for "eat healthier" (steps.ts). A loss goal
// under BMI 18.5 is raised to the healthy minimum (SPEC scr 12 ▸).

export default function GoalWeightStep() {
  useStepFocus('goal-weight');
  const { answers } = useOnboarding();
  const [units] = useUnits();
  const current = answers.weightKg ?? 70;
  const losing = answers.goal !== 'gain';
  const minKg = round(minHealthyWeightKg(answers.heightCm ?? 170), 1);
  const [kg, setKg] = useState(
    () => answers.goalWeightKg ?? round(losing ? Math.max(minKg, current - 5) : current + 3, 1),
  );

  const show = (v: number) => `${displayWeight(v, units.weight)} ${units.weight}`;
  const wrongSide = losing ? kg >= current : kg <= current;
  const belowHealthy = losing && kg < minKg;
  const note = wrongSide
    ? `Pick a weight ${losing ? 'below' : 'above'} your current ${show(current)}.`
    : belowHealthy
      ? `That’s under a healthy weight for your height, so Halo will aim for ${show(minKg)}.`
      : null;

  return (
    <OnboardingScreen
      scroll={false}
      title="Where would you like to be?"
      footer={
        <PrimaryButton
          label="Next"
          disabled={wrongSide}
          onPress={() => {
            setAnswers({ goalWeightKg: round(belowHealthy ? minKg : kg, 1) });
            goNext('goal-weight');
          }}
        />
      }>
      <View className="flex-1 justify-center pb-10">
        <WeightInput kg={kg} onChangeKg={setKg} />
        <Text
          accessibilityLiveRegion="polite"
          className="mt-6 min-h-[44px] text-center font-sans text-[15px] leading-[22px] text-opportunity">
          {note ?? ''}
        </Text>
      </View>
    </OnboardingScreen>
  );
}
