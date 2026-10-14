import { type Href, router, useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';

import { completeOnboarding, getOnboarding, setStep } from './state';
import { nextStep, previousStep, type StepId } from './steps';

const hrefOf = (step: StepId) => `/onboarding/${step}` as Href;

/** Records the visible step so closing the app resumes here (also after hardware back). */
export function useStepFocus(step: StepId) {
  useFocusEffect(
    useCallback(() => {
      setStep(step);
    }, [step]),
  );
}

/** Forward: the next visible step, or finish onboarding (the root guard then shows Today). */
export function goNext(current: StepId) {
  const next = nextStep(current, getOnboarding().answers);
  if (next) router.push(hrefOf(next));
  else completeOnboarding();
}

/** Back: pop when there's history; after a resume there isn't, so replace with the previous step. */
export function goBack(current: StepId) {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  const previous = previousStep(current, getOnboarding().answers);
  if (previous) router.replace(hrefOf(previous));
}

export { hrefOf };

const AUTO_ADVANCE_MS = 300;

/**
 * Single-choice steps advance on their own once the selected state has registered (300ms).
 * Guards double taps, and re-arms when the user comes back to the step.
 */
export function useAutoAdvance(step: StepId) {
  const pending = useRef(false);
  useFocusEffect(
    useCallback(() => {
      pending.current = false;
    }, []),
  );
  return () => {
    if (pending.current) return;
    pending.current = true;
    setTimeout(() => goNext(step), AUTO_ADVANCE_MS);
  };
}
