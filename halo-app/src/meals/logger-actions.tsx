import { router } from 'expo-router';
import type { ComponentType } from 'react';
import { Text, View } from 'react-native';

import { ChatIcon, HistoryIcon, RunIcon, ScaleIcon, WaterIcon } from '@/components/icons';
import { PressScale } from '@/components/press-scale';
import { addWater } from '@/lib/water';
import { useHaloTheme } from '@/theme/theme-provider';

/** The row of shortcuts under the logger's card. A note already typed goes to the Advisor. */
export function LoggerActions({ note, onWaterMore }: { note: string; onWaterMore: () => void }) {
  return (
    <View className="mt-4 flex-row justify-between">
      <Action label="History" Icon={HistoryIcon} onPress={() => router.navigate('/history')} />
      <Action label="Water" Icon={WaterIcon} onPress={() => addWater()} onLongPress={onWaterMore} />
      <Action label="Weigh-in" Icon={ScaleIcon} onPress={() => router.push('/weigh-in')} />
      <Action
        label="Advisor"
        Icon={ChatIcon}
        // A note already typed here goes along as the question.
        onPress={() =>
          router.push({
            pathname: '/advisor',
            params: { from: 'plus', ...(note.trim() ? { note: note.trim() } : {}) },
          })
        }
      />
      <Action label="Workout" Icon={RunIcon} onPress={() => router.navigate('/exercise')} />
    </View>
  );
}

function Action({
  label,
  Icon,
  onPress,
  onLongPress,
}: {
  label: string;
  Icon: ComponentType<{ size?: number; color: string }>;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const { theme } = useHaloTheme();
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={onLongPress ? 'Long-press for other amounts' : undefined}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      className="items-center">
      <View className="h-14 w-14 items-center justify-center rounded-full border border-hairline/10 bg-glass/10">
        <Icon size={24} color={theme.colors.text} />
      </View>
      <Text className="mt-1.5 font-sans text-[12px] text-text/85">{label}</Text>
    </PressScale>
  );
}
