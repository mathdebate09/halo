import { useState } from 'react';
import { Text, View } from 'react-native';

import { PrimaryButton, QuietButton } from '@/components/button';
import { ExerciseIcon, MoonIcon, ScaleIcon, VitalsIcon } from '@/components/icons';
import { connectHealthConnect, readAverageSteps, readBodyMeasurements } from '@/lib/health-connect';
import { goNext, useStepFocus } from '@/onboarding/navigation';
import { OnboardingScreen } from '@/onboarding/onboarding-screen';
import { OverlayCard } from '@/onboarding/overlay-card';
import { ScreenTimeCard } from '@/onboarding/screen-time-card';
import { setAnswers } from '@/onboarding/state';
import { useHaloTheme } from '@/theme/theme-provider';

// scr 3: urge Health Connect, never block (SPEC §2 ▸). Imported values only prefill later steps.
// Below it, the screen-time fallback for sleep (Usage access) and the floating overlay (Display over
// other apps), optional like everything here.

const IMPORTS = [
  { Icon: ScaleIcon, label: 'Weight and height', detail: 'Filled in for you' },
  {
    Icon: ExerciseIcon,
    label: 'Steps, distance and workouts',
    detail: 'Your activity score, measured',
  },
  { Icon: MoonIcon, label: 'Sleep', detail: 'Bedtime nudges that fit you' },
  { Icon: VitalsIcon, label: 'Heart rate and other vitals', detail: 'If your devices record them' },
] as const;

export default function HealthStep() {
  useStepFocus('health');
  const { theme } = useHaloTheme();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const connect = async () => {
    setBusy(true);
    const status = await connectHealthConnect();
    if (status === 'connected') {
      const [body, averageSteps] = await Promise.all([readBodyMeasurements(), readAverageSteps()]);
      setAnswers({
        healthConnect: { status, ...body, averageSteps: averageSteps ?? undefined, at: Date.now() },
      });
      setBusy(false);
      goNext('health');
      return;
    }
    setAnswers({ healthConnect: { status, at: Date.now() } });
    setBusy(false);
    setNotice(
      status === 'unavailable'
        ? 'Health Connect isn’t available on this phone. You can connect it later from Exercise.'
        : 'No access granted. You can connect any time from Exercise.',
    );
  };

  const skip = () => {
    setAnswers({ healthConnect: { status: 'skipped', at: Date.now() } });
    goNext('health');
  };

  return (
    <OnboardingScreen
      title="Connect Health Connect"
      footer={
        notice ? (
          <PrimaryButton label="Continue" onPress={() => goNext('health')} />
        ) : (
          <>
            <PrimaryButton
              label={busy ? 'Connecting…' : 'Connect Health Connect'}
              disabled={busy}
              onPress={connect}
            />
            <QuietButton label="Skip for now" onPress={skip} disabled={busy} />
          </>
        )
      }>
      <View className="gap-5">
        {IMPORTS.map(({ Icon, label, detail }) => (
          <View key={label} className="flex-row items-center">
            <View className="h-11 w-11 items-center justify-center rounded-full bg-glass/10">
              <Icon size={22} color={theme.colors.text} />
            </View>
            <View className="ml-4 flex-1">
              <Text className="font-sans-medium text-[17px] text-text">{label}</Text>
              <Text className="mt-0.5 font-sans text-[14px] text-muted">{detail}</Text>
            </View>
          </View>
        ))}
      </View>
      <ScreenTimeCard />
      <OverlayCard />
      {notice ? (
        <Text
          accessibilityLiveRegion="polite"
          className="mt-8 font-sans text-[15px] leading-[22px] text-opportunity">
          {notice}
        </Text>
      ) : null}
    </OnboardingScreen>
  );
}
