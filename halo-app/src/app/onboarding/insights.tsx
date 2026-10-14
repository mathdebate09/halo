import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { PrimaryButton } from '@/components/button';
import { goNext, useStepFocus } from '@/onboarding/navigation';
import { OnboardingScreen } from '@/onboarding/onboarding-screen';
import { useHaloTheme } from '@/theme/theme-provider';

// scr 5: everything logged becomes today's plan. A miniature of the Today screen.

export default function InsightsStep() {
  useStepFocus('insights');
  const { theme } = useHaloTheme();

  return (
    <OnboardingScreen
      title="Everything you log becomes today’s plan"
      footer={<PrimaryButton label="Continue" onPress={() => goNext('insights')} />}>
      <View className="items-center rounded-card border border-hairline/10 bg-surface px-6 pb-7 pt-6">
        <View className="flex-row gap-3">
          {[
            ['78', 'Diet'],
            ['64', 'Activity'],
            ['81', 'Vitals'],
          ].map(([value, label]) => (
            <View key={label} className="items-center">
              <View className="h-14 w-14 items-center justify-center rounded-full border border-hairline/15 bg-glass/10">
                <Text className="font-sans text-[17px] text-text">{value}</Text>
              </View>
              <Text className="mt-1.5 font-sans text-[12px] text-text/80">{label}</Text>
            </View>
          ))}
        </View>
        <Svg width={220} height={64} viewBox="0 0 220 64" style={{ marginTop: 18 }}>
          <Path
            d="M10 60 A125 125 0 0 1 210 60"
            stroke={theme.colors.arc}
            strokeOpacity={0.25}
            strokeWidth={3}
            fill="none"
            strokeLinecap="round"
          />
          <Path
            d="M10 60 A125 125 0 0 1 179.9 31.4"
            stroke={theme.colors.arc}
            strokeWidth={3}
            fill="none"
            strokeLinecap="round"
          />
        </Svg>
        <Text className="-mt-6 font-serif text-[56px] leading-[60px] text-text">82</Text>
        <Text className="mt-2 font-serif text-[26px] text-text">Go get ’em</Text>
        <Text className="mt-1 text-center font-sans text-[14px] text-muted">
          Protein is on track. A short walk after lunch keeps the momentum.
        </Text>
      </View>
    </OnboardingScreen>
  );
}
