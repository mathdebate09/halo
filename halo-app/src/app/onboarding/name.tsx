import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Text, TextInput } from 'react-native';

import { PrimaryButton } from '@/components/button';
import { goNext, useStepFocus } from '@/onboarding/navigation';
import { OnboardingScreen } from '@/onboarding/onboarding-screen';
import { setAnswers, useOnboarding } from '@/onboarding/state';
import { API_URL } from '@/sync/api';
import { useHaloTheme } from '@/theme/theme-provider';

// scr 14: first name only (optional) and the terms note. No email, password or sign-in.

export default function NameStep() {
  useStepFocus('name');
  const { theme } = useHaloTheme();
  const { answers } = useOnboarding();
  const [name, setName] = useState(answers.name ?? '');

  const next = () => {
    setAnswers({ name: name.trim() || undefined });
    goNext('name');
  };
  const open = (page: 'terms' | 'privacy') =>
    void WebBrowser.openBrowserAsync(`${API_URL}/legal/${page}`);

  return (
    <OnboardingScreen
      title="What should we call you?"
      footer={
        <>
          <Text className="mb-3 text-center font-sans text-[13px] leading-[19px] text-muted">
            By continuing you agree to the{' '}
            <Text onPress={() => open('terms')} className="text-text underline">
              Terms
            </Text>{' '}
            and{' '}
            <Text onPress={() => open('privacy')} className="text-text underline">
              Privacy Policy
            </Text>
            .
          </Text>
          <PrimaryButton label="Continue" onPress={next} />
        </>
      }>
      <TextInput
        accessibilityLabel="First name"
        value={name}
        onChangeText={setName}
        onSubmitEditing={next}
        placeholder="First name"
        placeholderTextColor={theme.colors.muted}
        autoCapitalize="words"
        autoComplete="given-name"
        returnKeyType="next"
        maxLength={30}
        selectionColor={theme.colors.accent}
        className="h-16 rounded-[22px] border border-hairline/10 bg-glass/[0.07] px-5 font-sans text-[20px] text-text"
      />
    </OnboardingScreen>
  );
}
