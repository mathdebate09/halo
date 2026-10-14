import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressScale } from '@/components/press-scale';

// Stub for the plus button; the logging chunk replaces this with the camera Meal Logger.
export default function LogModal() {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 justify-end">
      <Pressable
        accessibilityLabel="Close"
        onPress={() => router.back()}
        className="absolute inset-0 bg-veil/70"
      />
      <View
        style={{ marginBottom: insets.bottom + 12 }}
        className="mx-4 rounded-card border border-hairline/10 bg-surface p-6">
        <Text className="font-serif text-[36px] text-text">Meal Logger</Text>
        <Text className="mt-2 font-sans text-[16px] leading-[24px] text-muted">
          Photo and text meal logging, water and weigh-ins arrive in the logging chunk.
        </Text>
        <PressScale
          onPress={() => router.back()}
          className="mt-6 items-center rounded-pill bg-glass/10 py-3.5">
          <Text className="font-sans-medium text-[16px] text-text">Close</Text>
        </PressScale>
      </View>
    </View>
  );
}
