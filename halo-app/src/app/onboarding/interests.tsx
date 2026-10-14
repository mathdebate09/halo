import * as Haptics from 'expo-haptics';
import { View } from 'react-native';

import { PrimaryButton } from '@/components/button';
import { goNext, useStepFocus } from '@/onboarding/navigation';
import { OnboardingScreen } from '@/onboarding/onboarding-screen';
import { OptionCard } from '@/onboarding/option-card';
import { INTERESTS, setAnswers, useOnboarding } from '@/onboarding/state';

// scr 7: secondary motivations (multi-select, explicit Next; choosing none is fine).

export default function InterestsStep() {
  useStepFocus('interests');
  const { answers } = useOnboarding();

  const toggle = (id: (typeof INTERESTS)[number]['id']) => {
    void Haptics.selectionAsync();
    const has = answers.interests.includes(id);
    setAnswers({
      interests: has ? answers.interests.filter((i) => i !== id) : [...answers.interests, id],
    });
  };

  return (
    <OnboardingScreen
      title="What else is important to you?"
      subtitle="Choose any. Halo leans its tips toward these."
      footer={<PrimaryButton label="Next" onPress={() => goNext('interests')} />}>
      <View className="gap-3">
        {INTERESTS.map((interest) => (
          <OptionCard
            key={interest.id}
            multi
            label={interest.label}
            selected={answers.interests.includes(interest.id)}
            onPress={() => toggle(interest.id)}
          />
        ))}
      </View>
    </OnboardingScreen>
  );
}
