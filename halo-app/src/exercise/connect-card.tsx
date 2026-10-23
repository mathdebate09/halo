import { Linking, Text, View } from 'react-native';
import { openHealthConnectSettings } from 'react-native-health-connect';
import Animated, { FadeIn } from 'react-native-reanimated';

import { PrimaryButton } from '@/components/button';
import { connectHealthConnect, type HealthConnectState } from '@/lib/health-connect';

const PLAY_STORE = 'market://details?id=com.google.android.apps.healthdata';

const CONNECT_COPY: Record<
  Exclude<HealthConnectState, 'connected'>,
  { title: string; line: string; button: string }
> = {
  unavailable: {
    title: 'Get Health Connect',
    line: 'Steps, distance and workouts from your phone and watch, measured.',
    button: 'Open Play Store',
  },
  update: {
    title: 'Update Health Connect',
    line: 'This version is too old for Halo to read your activity.',
    button: 'Update',
  },
  denied: {
    title: 'Connect Health Connect',
    line: 'Steps, distance and workouts from your phone and watch, measured.',
    button: 'Connect',
  },
};

/** The one card for each way Health Connect can be missing: no fake numbers. */
export function ConnectCard({
  state,
  onConnected,
}: {
  state: Exclude<HealthConnectState, 'connected'>;
  onConnected: () => void;
}) {
  const copy = CONNECT_COPY[state];
  const act = async () => {
    if (state === 'denied') {
      if ((await connectHealthConnect()) === 'connected') onConnected();
      return;
    }
    Linking.openURL(PLAY_STORE).catch(() => {});
  };
  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      className="mt-8 rounded-card border border-hairline/10 bg-surface px-5 pb-5 pt-6">
      <Text className="font-serif text-[28px] text-text">{copy.title}</Text>
      <Text className="mt-2 font-sans text-[16px] leading-[24px] text-muted">{copy.line}</Text>
      <View className="mt-6">
        <PrimaryButton label={copy.button} onPress={act} />
      </View>
    </Animated.View>
  );
}

/** Connected, but nothing recorded in a week: point at Health Connect itself. */
export function EmptyCard() {
  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      className="mt-8 rounded-card border border-hairline/10 bg-surface px-5 pb-5 pt-6">
      <Text className="font-serif text-[28px] text-text">Nothing recorded yet</Text>
      <Text className="mt-2 font-sans text-[16px] leading-[24px] text-muted">
        No steps or workouts in Health Connect this week. Check that your phone or watch app shares
        activity with it.
      </Text>
      <View className="mt-6">
        <PrimaryButton label="Open Health Connect" onPress={() => openHealthConnectSettings()} />
      </View>
    </Animated.View>
  );
}
