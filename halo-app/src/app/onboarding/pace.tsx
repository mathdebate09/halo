import { useState } from 'react';
import { Text, View } from 'react-native';

import { PrimaryButton } from '@/components/button';
import { DetentSlider } from '@/components/detent-slider';
import { previewPlan } from '@/lib/plan';
import { useUnits } from '@/lib/units';
import { goNext, useStepFocus } from '@/onboarding/navigation';
import { OnboardingScreen } from '@/onboarding/onboarding-screen';
import { setAnswers, useOnboarding } from '@/onboarding/state';
import { displayWeight, type Pace, PACE_LABEL } from '@/shared';

// scr 13: speed of change. Rates stay within the 1%/week cap and the calorie floor (shared plan).
const PACES: Pace[] = ['gentle', 'steady', 'faster'];

export default function PaceStep() {
  useStepFocus('pace');
  const { answers } = useOnboarding();
  const [units] = useUnits();
  const [index, setIndex] = useState(() => PACES.indexOf(answers.pace ?? 'steady'));
  const pace = PACES[index]!;
  const plan = previewPlan({ ...answers, pace });
  const rate = plan ? Math.abs(plan.rateKgPerWeek) : 0;
  const when = plan?.goalDate?.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const note = plan?.floorApplied
    ? 'Your calories stay at a safe minimum, so this takes a little longer.'
    : plan?.rateCapped
      ? 'Capped at 1% of your weight a week.'
      : null;

  return (
    <OnboardingScreen
      scroll={false}
      title="How fast would you like to go?"
      footer={
        <PrimaryButton
          label="Next"
          onPress={() => {
            setAnswers({ pace });
            goNext('pace');
          }}
        />
      }>
      <View className="flex-1 justify-center pb-16">
        <Text className="text-center font-serif text-[44px] text-text">{PACE_LABEL[pace]}</Text>
        <Text className="mt-2 text-center font-sans text-[17px] text-text/80">
          {displayWeight(rate, units.weight)} {units.weight} a week
          {when ? ` · around ${when}` : ''}
        </Text>
        <View className="mt-12">
          <DetentSlider
            count={PACES.length}
            index={index}
            onChange={setIndex}
            accessibilityLabel="Pace"
            accessibilityValueText={PACE_LABEL[pace]}
          />
        </View>
        <Text className="mt-6 min-h-[44px] text-center font-sans text-[15px] text-opportunity">
          {note ?? ''}
        </Text>
      </View>
    </OnboardingScreen>
  );
}
