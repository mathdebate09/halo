import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { PrimaryButton } from '@/components/button';
import { DateWheels, wheelDate, wheelKey } from '@/components/date-wheels';
import { goNext, useStepFocus } from '@/onboarding/navigation';
import { OnboardingScreen } from '@/onboarding/onboarding-screen';
import { setAnswers, useOnboarding } from '@/onboarding/state';
import { isAdult } from '@/shared';

// scr 9: day / month / year wheels. Under 18 goes to a gentle stop (adult.tsx).

const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 101 }, (_, i) => THIS_YEAR - 100 + i);

export default function BirthStep() {
  useStepFocus('birth');
  const { answers } = useOnboarding();
  const [date, setDate] = useState(() =>
    answers.birthDate ? wheelDate(answers.birthDate) : { year: THIS_YEAR - 30, month: 0, day: 1 },
  );

  const next = () => {
    setAnswers({ birthDate: wheelKey(date) });
    if (isAdult(new Date(date.year, date.month, date.day))) goNext('birth');
    else router.push('/onboarding/adult');
  };

  return (
    <OnboardingScreen
      scroll={false}
      title="When were you born?"
      footer={<PrimaryButton label="Next" onPress={next} />}>
      <View className="mt-6">
        <DateWheels value={date} onChange={setDate} years={YEARS} />
      </View>
    </OnboardingScreen>
  );
}
