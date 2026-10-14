import { Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedScreen } from '@/components/themed-screen';

// Placeholder until the Exercise chunk.
export default function ExerciseScreen() {
  const insets = useSafeAreaInsets();
  return (
    <ThemedScreen>
      <Text
        style={{ marginTop: insets.top + 16 }}
        className="text-center font-sans text-[18px] text-text">
        Exercise
      </Text>
      <Text className="mt-[40%] px-10 text-center font-serif text-[32px] leading-[38px] text-text/80">
        Health Connect steps, distance and pace land here.
      </Text>
    </ThemedScreen>
  );
}
