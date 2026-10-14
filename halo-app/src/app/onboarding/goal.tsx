import * as Haptics from 'expo-haptics';
import { View } from 'react-native';

import { useAutoAdvance, useStepFocus } from '@/onboarding/navigation';
import { OnboardingScreen } from '@/onboarding/onboarding-screen';
import { OptionCard } from '@/onboarding/option-card';
import { setAnswers, useOnboarding } from '@/onboarding/state';
import type { Goal } from '@/shared';

// scr 6: the primary goal. Changing it later clears the goal weight and pace (state.ts).
const GOALS: { id: Goal; label: string }[] = [
  { id: 'lose', label: 'I want to lose weight' },
  { id: 'maintain', label: 'Fine, but I want to eat healthier' },
  { id: 'gain', label: 'I want more muscle mass' },
];

export default function GoalStep() {
  useStepFocus('goal');
  const advance = useAutoAdvance('goal');
  const { answers } = useOnboarding();

  return (
    <OnboardingScreen title="How do you feel about your weight?">
      <View accessibilityRole="radiogroup" className="gap-3">
        {GOALS.map((goal) => (
          <OptionCard
            key={goal.id}
            label={goal.label}
            selected={answers.goal === goal.id}
            onPress={() => {
              void Haptics.selectionAsync();
              setAnswers({ goal: goal.id });
              advance();
            }}
          />
        ))}
      </View>
    </OnboardingScreen>
  );
}
