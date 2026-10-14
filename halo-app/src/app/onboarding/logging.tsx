import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/components/button';
import { goNext, useStepFocus } from '@/onboarding/navigation';
import { OnboardingScreen } from '@/onboarding/onboarding-screen';
import { useHaloTheme } from '@/theme/theme-provider';
import { withAlpha } from '@/theme/themes';

// scr 4: effortless logging. The orb previews the blurred camera of the Meal Logger
// (references/logger-blur-example.png), drawn from the theme's own colours.

export default function LoggingStep() {
  useStepFocus('logging');
  const { theme } = useHaloTheme();
  const c = theme.colors;

  return (
    <OnboardingScreen
      title="Log a meal in seconds"
      subtitle="Snap a photo or type a few words. Halo works out what’s on the plate and estimates calories and macros. You just confirm."
      footer={<PrimaryButton label="Continue" onPress={() => goNext('logging')} />}>
      <View className="items-center">
        <View className="h-[280px] w-[280px] items-center justify-center overflow-hidden rounded-[96px]">
          <LinearGradient
            colors={[
              withAlpha(c.strength, 0.9),
              withAlpha(c.accent, 0.75),
              withAlpha(c.steady, 0.85),
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={[withAlpha(c.opportunity, 0.7), withAlpha(c.opportunity, 0)]}
            start={{ x: 0, y: 1 }}
            end={{ x: 0.7, y: 0.3 }}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={[withAlpha(c.bg, 0), withAlpha(c.bg, 0.55)]}
            start={{ x: 0.2, y: 0.2 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <Text className="font-serif text-[30px] text-text">Meal Logger</Text>
          <Text className="mt-2 px-10 text-center font-sans text-[14px] text-text/85">
            grilled, no oil, half portion
          </Text>
        </View>
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
