import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { PrimaryButton } from '@/components/button';
import { WHEEL_ITEM_HEIGHT, WheelPicker } from '@/components/wheel-picker';
import { goNext, useStepFocus } from '@/onboarding/navigation';
import { OnboardingScreen } from '@/onboarding/onboarding-screen';
import { setAnswers, useOnboarding } from '@/onboarding/state';
import { isAdult } from '@/shared';

// scr 9: day / month / year wheels. Under 18 goes to a gentle stop (adult.tsx).

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 101 }, (_, i) => THIS_YEAR - 100 + i);
const pad = (n: number) => String(n).padStart(2, '0');
const daysIn = (year: number, month: number) => new Date(year, month + 1, 0).getDate();

function initial(birthDate?: string) {
  if (birthDate) {
    const [y, m, d] = birthDate.split('-').map(Number) as [number, number, number];
    return { year: y, month: m - 1, day: d };
  }
  return { year: THIS_YEAR - 30, month: 0, day: 1 };
}

export default function BirthStep() {
  useStepFocus('birth');
  const { answers } = useOnboarding();
  const [date, setDate] = useState(() => initial(answers.birthDate));
  const days = Array.from({ length: daysIn(date.year, date.month) }, (_, i) => String(i + 1));

  // A shorter month (or a non-leap February) clamps the day.
  const update = (patch: Partial<typeof date>) =>
    setDate((d) => {
      const next = { ...d, ...patch };
      return { ...next, day: Math.min(next.day, daysIn(next.year, next.month)) };
    });

  const next = () => {
    setAnswers({ birthDate: `${date.year}-${pad(date.month + 1)}-${pad(date.day)}` });
    if (isAdult(new Date(date.year, date.month, date.day))) goNext('birth');
    else router.push('/onboarding/adult');
  };

  return (
    <OnboardingScreen
      scroll={false}
      title="When were you born?"
      footer={<PrimaryButton label="Next" onPress={next} />}>
      <View className="mt-6 flex-row">
        {/* The centre band marks the selected row across all three wheels. */}
        <View
          pointerEvents="none"
          style={{ top: WHEEL_ITEM_HEIGHT * 2, height: WHEEL_ITEM_HEIGHT }}
          className="absolute inset-x-0 rounded-2xl bg-glass/10"
        />
        <View className="flex-[0.8]">
          <WheelPicker
            accessibilityLabel="Day"
            items={days}
            selectedIndex={date.day - 1}
            onChange={(i) => update({ day: i + 1 })}
          />
        </View>
        <View className="flex-[1.2]">
          <WheelPicker
            accessibilityLabel="Month"
            items={MONTHS}
            selectedIndex={date.month}
            onChange={(i) => update({ month: i })}
          />
        </View>
        <View className="flex-1">
          <WheelPicker
            accessibilityLabel="Year"
            items={YEARS.map(String)}
            selectedIndex={YEARS.indexOf(date.year)}
            onChange={(i) => update({ year: YEARS[i]! })}
          />
        </View>
      </View>
    </OnboardingScreen>
  );
}
