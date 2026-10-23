import type { ComponentType } from 'react';
import { Text, View } from 'react-native';
import { ExerciseType } from 'react-native-health-connect';

import {
  BikeIcon,
  ExerciseIcon,
  HikeIcon,
  RunIcon,
  StrengthIcon,
  SwimIcon,
  WalkIcon,
  YogaIcon,
} from '@/components/icons';
import { formatTime } from '@/lib/clock';
import { type ExerciseSessionInfo, formatDistance, formatDuration } from '@/shared';
import { useHaloTheme } from '@/theme/theme-provider';
import { withAlpha } from '@/theme/themes';

type IconComponent = ComponentType<{ size?: number; color: string }>;

// Health Connect's exercise types that have their own glyph. A new glyph is one more entry here.
const TYPE_ICONS: Partial<Record<number, IconComponent>> = {
  [ExerciseType.WALKING]: WalkIcon,
  [ExerciseType.HIKING]: HikeIcon,
  [ExerciseType.RUNNING]: RunIcon,
  [ExerciseType.RUNNING_TREADMILL]: RunIcon,
  [ExerciseType.BIKING]: BikeIcon,
  [ExerciseType.BIKING_STATIONARY]: BikeIcon,
  [ExerciseType.SWIMMING_POOL]: SwimIcon,
  [ExerciseType.SWIMMING_OPEN_WATER]: SwimIcon,
  [ExerciseType.WEIGHTLIFTING]: StrengthIcon,
  [ExerciseType.STRENGTH_TRAINING]: StrengthIcon,
  [ExerciseType.CALISTHENICS]: StrengthIcon,
  [ExerciseType.YOGA]: YogaIcon,
  [ExerciseType.PILATES]: YogaIcon,
  [ExerciseType.STRETCHING]: YogaIcon,
};

/** The glyph for a session's activity. */
function iconFor(session: ExerciseSessionInfo): IconComponent {
  return (
    (session.type != null ? TYPE_ICONS[session.type] : undefined) ??
    (session.kind === 'walk' ? WalkIcon : session.kind === 'run' ? RunIcon : ExerciseIcon)
  );
}

export function SessionRow({
  session: s,
  miles,
  first,
}: {
  session: ExerciseSessionInfo;
  miles: boolean;
  first: boolean;
}) {
  const { theme } = useHaloTheme();
  const Icon = iconFor(s);
  const details = [
    formatDuration(s.end - s.start),
    s.distanceM ? formatDistance(s.distanceM, miles) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <View
      className={`flex-row items-center ${first ? '' : 'mt-3 border-t border-hairline/10 pt-3'}`}>
      <View
        className="h-11 w-11 items-center justify-center rounded-full"
        style={{ backgroundColor: withAlpha(theme.colors.accent, 0.16) }}>
        <Icon size={22} color={theme.colors.accent} />
      </View>
      <View className="ml-3 flex-1">
        <Text className="font-sans-medium text-[16px] text-text">{s.title}</Text>
        <Text className="mt-0.5 font-sans text-[14px] text-muted">
          {formatTime(new Date(s.start))} · {details}
        </Text>
      </View>
    </View>
  );
}
