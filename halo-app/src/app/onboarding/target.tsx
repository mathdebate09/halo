import { Text, View } from 'react-native';

import { PrimaryButton } from '@/components/button';
import { usePlan } from '@/lib/plan';
import { goNext, useStepFocus } from '@/onboarding/navigation';
import { OnboardingScreen } from '@/onboarding/onboarding-screen';
import { type ActivityLevel, macroShares } from '@/shared';

// scr 17: the daily target and macros (shared plan maths), much simpler than the dashboard.

const ACTIVITY: Record<ActivityLevel, string> = {
  sedentary: 'mostly seated',
  light: 'lightly active',
  moderate: 'moderately active',
  active: 'very active',
};

export default function TargetStep() {
  useStepFocus('target');
  const plan = usePlan();
  if (!plan) return null;
  const shares = macroShares(plan);
  const macros = [
    { label: 'Protein', value: `${plan.proteinG} g`, share: shares.protein },
    { label: 'Carbs', value: `${plan.carbsG} g`, share: shares.carbs },
    { label: 'Fat', value: `${plan.fatG} g`, share: shares.fat },
  ];
  const basis =
    plan.activitySource === 'steps'
      ? `Based on being ${ACTIVITY[plan.activity]}, from your steps`
      : `Based on being ${ACTIVITY[plan.activity]}. Halo adjusts as it learns your steps.`;

  return (
    <OnboardingScreen
      title="Your daily target"
      footer={<PrimaryButton label="Continue" onPress={() => goNext('target')} />}>
      <View className="items-center">
        <Text className="font-serif text-[96px] leading-[104px] text-text">
          {plan.targetKcal.toLocaleString()}
        </Text>
        <Text className="font-sans text-[16px] text-muted">calories a day</Text>
      </View>
      <View className="mt-10 gap-5">
        {macros.map((m) => (
          <View key={m.label}>
            <View className="flex-row justify-between">
              <Text className="font-sans-medium text-[16px] text-text">{m.label}</Text>
              <Text className="font-sans text-[16px] text-text/80">{m.value}</Text>
            </View>
            <View className="mt-2 h-[6px] overflow-hidden rounded-pill bg-glass/10">
              <View
                style={{ width: `${Math.round(m.share * 100)}%` }}
                className="h-full rounded-pill bg-text"
              />
            </View>
          </View>
        ))}
        <View className="flex-row justify-between border-t border-hairline/10 pt-4">
          <Text className="font-sans-medium text-[16px] text-text">Fiber</Text>
          <Text className="font-sans text-[16px] text-text/80">{plan.fiberG} g</Text>
        </View>
        <View className="flex-row justify-between">
          <Text className="font-sans-medium text-[16px] text-text">Water</Text>
          <Text className="font-sans text-[16px] text-text/80">
            {(plan.waterMl / 1000).toFixed(1)} L
          </Text>
        </View>
      </View>
      <Text className="mt-8 text-center font-sans text-[13px] text-muted">{basis}</Text>
    </OnboardingScreen>
  );
}
