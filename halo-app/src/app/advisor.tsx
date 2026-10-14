import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChevronLeftIcon } from '@/components/icons';
import { ThemedScreen } from '@/components/themed-screen';
import { useHaloTheme } from '@/theme/theme-provider';

// Stub until the Advisor chunk (21).
export default function AdvisorScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useHaloTheme();
  return (
    <ThemedScreen>
      <View className="px-4" style={{ paddingTop: insets.top + 8 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          hitSlop={8}
          className="h-11 w-11 items-center justify-center rounded-full active:bg-glass/10">
          <ChevronLeftIcon size={24} color={theme.colors.text} />
        </Pressable>
        <Text accessibilityRole="header" className="mt-6 px-2 font-serif text-[44px] text-text">
          Advisor
        </Text>
        <Text className="mt-2 px-2 font-sans text-[17px] text-muted">Coming soon.</Text>
      </View>
    </ThemedScreen>
  );
}
