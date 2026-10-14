import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDockInset } from '@/components/dock';
import { Reveal } from '@/components/reveal';
import { ThemedScreen } from '@/components/themed-screen';

// Type and surface specimen in Oura's language. Proves fonts, theme tokens, alpha and hairlines
// on device; replaced by the real Today screen later.

const SCORES = [
  { label: 'Diet', value: '7.8' },
  { label: 'Activity', value: '6.4' },
  { label: 'Vitals', value: '8.1' },
] as const;

export default function SpecimenScreen() {
  const insets = useSafeAreaInsets();
  const dockInset = useDockInset();

  return (
    <ThemedScreen>
      <ScrollView
        className="flex-1"
        contentContainerClassName="items-center px-6"
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: dockInset }}>
        {/* Long-press the wordmark for the hidden developer screen. */}
        <Reveal index={0}>
          <Pressable onLongPress={() => router.push('/dev')} delayLongPress={600} hitSlop={12}>
            <Text className="font-wordmark text-[28px] text-text">Halo</Text>
          </Pressable>
        </Reveal>

        <Reveal index={1} className="mt-8 flex-row gap-5">
          {SCORES.map((score) => (
            <View key={score.label} className="items-center">
              <View className="h-[76px] w-[76px] items-center justify-center rounded-full border border-hairline/15 bg-glass/10">
                <Text className="font-sans text-[24px] text-text">{score.value}</Text>
              </View>
              <Text className="mt-2 font-sans text-[15px] text-text/90">{score.label}</Text>
            </View>
          ))}
        </Reveal>

        <Reveal index={2} className="items-center">
          <Text className="mt-14 font-serif text-[112px] leading-[120px] text-text">82</Text>
          <Text className="font-sans-medium text-[13px] tracking-[2px] text-text/90">OVERALL</Text>
        </Reveal>

        <Reveal index={3} className="items-center">
          <Text className="mt-8 font-serif text-[48px] leading-[54px] text-text">Go get ’em</Text>
          <Text className="mt-4 text-center font-sans text-[17px] leading-[26px] text-text/85">
            Breakfast landed right on pace and your steps are ahead of yesterday. A protein-rich
            lunch keeps the momentum going.
          </Text>
        </Reveal>

        <Reveal index={4}>
          <Pressable className="mt-8 rounded-pill bg-glass/10 px-8 py-3.5 active:bg-glass/20">
            <Text className="font-sans-medium text-[16px] text-text">Learn more</Text>
          </Pressable>
        </Reveal>

        <Reveal
          index={5}
          className="mt-12 w-full flex-row items-center rounded-card border border-hairline/10 bg-surface p-5">
          <View className="h-12 w-12 items-center justify-center rounded-full bg-glass/10">
            <Text className="font-serif-italic text-[22px] text-text">z</Text>
          </View>
          <View className="ml-4 flex-1">
            <Text className="font-sans text-[18px] text-text">Sleep</Text>
            <Text className="mt-1 font-sans-medium text-[13px] tracking-[2px] text-accent">
              GOOD
            </Text>
          </View>
          <Text className="font-serif text-[40px] text-text">7h 40</Text>
        </Reveal>
      </ScrollView>
    </ThemedScreen>
  );
}
