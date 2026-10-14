import { Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedScreen } from '@/components/themed-screen';

// Placeholder until the Vitals chunk.
export default function VitalsScreen() {
  const insets = useSafeAreaInsets();
  return (
    <ThemedScreen>
      <Text
        style={{ marginTop: insets.top + 16 }}
        className="text-center font-sans text-[18px] text-text">
        Vitals
      </Text>
      <Text className="mt-[40%] px-10 text-center font-serif text-[32px] leading-[38px] text-text/80">
        Your readings, reports and the advisor land here.
      </Text>
    </ThemedScreen>
  );
}
