import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDockInset } from '@/components/dock';
import { ThemedScreen } from '@/components/themed-screen';
import { ActivityAnalysis } from '@/exercise/activity-analysis';
import { Climb } from '@/exercise/climb';
import { dayStart } from '@/shared';
import { useTodayScores } from '@/today/today-scores';

// Exercise (SPEC §3), laid out like Apple Health's summary but standalone: nothing here links
// away. The week strip picks the day, and every card shows that day. Aggregates come from the
// hc_daily cache (de-duplicated by Health Connect itself), hours are read on demand, sessions
// from the last two weeks. Burned calories are shown, never added to the food target.

export default function ExerciseScreen() {
  const insets = useSafeAreaInsets();
  const dockInset = useDockInset();
  const scores = useTodayScores();
  const [selected, setSelected] = useState(scores.day);
  // A new day (4 am) moves the selection along with it.
  useEffect(() => setSelected(scores.day), [scores.day]);

  const dateLabel = dayStart(selected, 12)
    .toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })
    .toUpperCase();

  // The analysis starts below the climb; the hero's button scrolls there.
  const { height: screenHeight } = useWindowDimensions();
  const scroll = useRef<ScrollView>(null);
  const analysisY = useRef(0);
  const openAnalysis = () =>
    scroll.current?.scrollTo({ y: analysisY.current - insets.top - 8, animated: true });

  return (
    <ThemedScreen>
      <ScrollView
        ref={scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: dockInset }}>
        <Climb
          top={insets.top}
          bottom={dockInset}
          height={screenHeight}
          onAnalysis={openAnalysis}
        />

        <View
          className="px-4"
          onLayout={(e) => {
            analysisY.current = e.nativeEvent.layout.y;
          }}>
          <View className="mt-8 px-1">
            <Text className="font-sans-medium text-[13px] tracking-[1px] text-muted">
              {dateLabel}
            </Text>
            <Text accessibilityRole="header" className="mt-1 font-serif text-[34px] text-text">
              Activity Analysis
            </Text>
          </View>
          <ActivityAnalysis selected={selected} onSelect={setSelected} />
        </View>
      </ScrollView>
    </ThemedScreen>
  );
}
