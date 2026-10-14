import { Text, View } from 'react-native';

import { PrimaryButton } from '@/components/button';
import { MealOrb } from '@/components/meal-orb';
import { goNext, useStepFocus } from '@/onboarding/navigation';
import { OnboardingScreen } from '@/onboarding/onboarding-screen';

// scr 4: effortless logging. The orb previews the blurred camera of the Meal Logger
// (references/logger-blur-example.png), drawn from the theme's own colours.

export default function LoggingStep() {
  useStepFocus('logging');

  return (
    <OnboardingScreen
      title="Log a meal in seconds"
      subtitle="Snap a photo or type a few words. Halo works out what’s on the plate and estimates calories and macros. You just confirm."
      footer={<PrimaryButton label="Continue" onPress={() => goNext('logging')} />}>
      <View className="items-center">
        <MealOrb caption="grilled, no oil, half portion" />
        <View className="mt-8 flex-row gap-3">
          {['Photo', 'Text', 'Water'].map((label) => (
            <View
              key={label}
              className="rounded-pill border border-hairline/10 bg-glass/10 px-4 py-2">
              <Text className="font-sans-medium text-[14px] text-text">{label}</Text>
            </View>
          ))}
        </View>
      </View>
    </OnboardingScreen>
  );
}
