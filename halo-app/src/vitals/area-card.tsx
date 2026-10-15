import { LinearGradient } from 'expo-linear-gradient';
import { Text, View } from 'react-native';

import { type Area, AREA_LABELS, AREA_STATE_LABELS } from '@/shared';
import { useHaloTheme } from '@/theme/theme-provider';
import { withAlpha } from '@/theme/themes';

import { AREA_ICONS, stateColor } from './areas';

const SOURCE_LABELS = { measured: 'Measured', estimated: 'Estimated', assumed: 'Assumed' } as const;

/** One area in the detail (Oura vitals style): icon, name, state word, score, its source. */
export function AreaCard({ area }: { area: Area }) {
  const { theme } = useHaloTheme();
  const c = theme.colors;
  const tint = stateColor(c, area.state);
  const Icon = AREA_ICONS[area.key];
  return (
    <View className="overflow-hidden rounded-[28px]">
      {/* A soft wash of the state's tint, like Oura's cards; className can't style the gradient. */}
      <LinearGradient
        colors={[withAlpha(tint, 0.16), withAlpha(tint, 0.05)]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
      />
      <View className="p-5">
        <View className="flex-row items-center">
          <View className="h-11 w-11 items-center justify-center rounded-full bg-glass/10">
            <Icon size={22} color={c.text} />
          </View>
          <View className="ml-3.5 flex-1">
            <Text className="font-sans text-[18px] text-text">{AREA_LABELS[area.key]}</Text>
            <Text
              className="mt-0.5 font-sans-medium text-[13px] tracking-[1.5px]"
              style={{ color: tint }}>
              {AREA_STATE_LABELS[area.state].toUpperCase()}
            </Text>
          </View>
        </View>
        <View className="mt-5 flex-row items-end justify-between">
          <Text className="font-serif text-[56px] leading-[66px] text-text">{area.score}</Text>
          <Text className="mb-2 font-sans text-[14px] text-muted">
            {SOURCE_LABELS[area.source]}
          </Text>
        </View>
      </View>
    </View>
  );
}
