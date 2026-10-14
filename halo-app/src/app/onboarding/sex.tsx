import * as Haptics from 'expo-haptics';
import { View } from 'react-native';

import { useAutoAdvance, useStepFocus } from '@/onboarding/navigation';
import { OnboardingScreen } from '@/onboarding/onboarding-screen';
import { OptionCard } from '@/onboarding/option-card';
import { setAnswers, useOnboarding } from '@/onboarding/state';
import type { Sex } from '@/shared';

// scr 8: sex at birth, used only for the BMR formula.
const OPTIONS: { id: Sex; label: string }[] = [
  { id: 'female', label: 'Female' },
  { id: 'male', label: 'Male' },
];

export default function SexStep() {
  useStepFocus('sex');
  const advance = useAutoAdvance('sex');
  const { answers } = useOnboarding();

  return (
    <OnboardingScreen
      title="Which sex were you born with?"
      subtitle="Only used to calculate your nutritional needs.">
      <View accessibilityRole="radiogroup" className="gap-3">
        {OPTIONS.map((option) => (
          <OptionCard
            key={option.id}
            label={option.label}
            selected={answers.sex === option.id}
            onPress={() => {
              void Haptics.selectionAsync();
              setAnswers({ sex: option.id });
              advance();
            }}
          />
        ))}
      </View>
    </OnboardingScreen>
  );
}
