import { Redirect } from 'expo-router';

import { hrefOf } from '@/onboarding/navigation';
import { getOnboarding } from '@/onboarding/state';

/** Resumes at the saved step. */
export default function OnboardingIndex() {
  return <Redirect href={hrefOf(getOnboarding().step)} />;
}
