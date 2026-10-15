import { LinearGradient } from 'expo-linear-gradient';
import { Text, View } from 'react-native';

import { PressScale } from '@/components/press-scale';
import { type Area, AREA_LABELS, AREA_STATE_LABELS } from '@/shared';
import { useHaloTheme } from '@/theme/theme-provider';
import { withAlpha } from '@/theme/themes';

import { AREA_ICONS, stateColor } from './areas';

/**
 * One area at the head of its readings (Oura vitals style): icon, name, its state, and one plain
 * sentence of the numbers behind it. No score: the 0-100 only places its orb on the hero.
 */
export function AreaCard({
  area,
  summary,
  action,
}: {
  area: Area;
  summary: string;
  /** The one step that fills a gap (e.g. "Weigh in" when there's no trend yet). */
  action?: { label: string; onPress: () => void };
}) {
  const { theme } = useHaloTheme();
  const c = theme.colors;
  const tint = stateColor(c, area.state);
  const Icon = AREA_ICONS[area.key];
  return (
    <View className="overflow-hidden rounded-[28px]">
      {/* A soft wash of the state's tint, like Oura's cards; className can't style the gradient. */}
      <LinearGradient
        colors={
          area.source === 'assumed'
            ? [withAlpha(c.text, 0.06), withAlpha(c.text, 0.02)]
            : [withAlpha(tint, 0.16), withAlpha(tint, 0.05)]
        }
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
            {area.source === 'assumed' ? (
              <Text className="mt-0.5 font-sans text-[14px] text-muted">Not enough data yet</Text>
            ) : (
              <Text
                className="mt-0.5 font-sans-medium text-[13px] tracking-[1.5px]"
                style={{ color: tint }}>
                {AREA_STATE_LABELS[area.state].toUpperCase()}
              </Text>
            )}
          </View>
        </View>
        <Text className="mt-4 font-sans text-[17px] leading-[25px] text-text/90">{summary}</Text>
        {action ? (
          <PressScale
            accessibilityRole="button"
            onPress={action.onPress}
            pressableStyle={{ alignSelf: 'flex-start' }}
            className="mt-4 rounded-pill bg-glass/10 px-5 py-2.5">
            <Text className="font-sans-medium text-[15px] text-text">{action.label}</Text>
          </PressScale>
        ) : null}
      </View>
    </View>
  );
}
