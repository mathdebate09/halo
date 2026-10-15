import { useRef } from 'react';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDockInset } from '@/components/dock';
import { ThemedScreen } from '@/components/themed-screen';
import { useTodayScores } from '@/today/today-scores';
import { AreaCard } from '@/vitals/area-card';
import { VitalsHero } from '@/vitals/hero';

// Vitals (SPEC §3), never called My Health: the hero (areas on their bands, one headline, one
// step), then every area in detail below the fold. Same shape as Today and Exercise.

export default function VitalsScreen() {
  const insets = useSafeAreaInsets();
  const dockInset = useDockInset();
  const { height } = useWindowDimensions();
  const { vitalsReport } = useTodayScores();

  const scroll = useRef<ScrollView>(null);
  const detailY = useRef(0);
  const openDetail = () =>
    scroll.current?.scrollTo({ y: detailY.current - insets.top - 8, animated: true });

  return (
    <ThemedScreen>
      <ScrollView
        ref={scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: dockInset }}>
        <VitalsHero top={insets.top} bottom={dockInset} height={height} onDetail={openDetail} />

        {/* At least a screen tall, so the Vitals pill can always bring the header to the top. */}
        <View
          className="px-4"
          style={{ minHeight: height - insets.top - dockInset }}
          onLayout={(e) => {
            detailY.current = e.nativeEvent.layout.y;
          }}>
          <Text accessibilityRole="header" className="mt-8 px-1 font-serif text-[34px] text-text">
            Vitals
          </Text>
          <View className="mt-4 gap-3">
            {vitalsReport.areas.map((area) => (
              <AreaCard key={area.key} area={area} />
            ))}
          </View>
        </View>
      </ScrollView>
    </ThemedScreen>
  );
}
