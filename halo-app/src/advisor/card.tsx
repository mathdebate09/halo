import { Text, View } from 'react-native';
import Animated, { Easing, FadeIn, useReducedMotion } from 'react-native-reanimated';

import { CheckIcon } from '@/components/icons';
import { PressScale } from '@/components/press-scale';

import { cardWords, type StoredCard } from './act';
import { ADVISOR_COLORS } from './theme';

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

/**
 * The reply's prepared step: what it is, its numbers, and one button that does it. Once done the
 * button gives way to a quiet check; the correction lives in the toast (Undo / View).
 */
export function AdvisorCardView({
  card,
  units,
  enterDelay,
  onAct,
}: {
  card: StoredCard;
  units: { pounds: boolean; clock24: boolean };
  /** A card that arrives with a streaming reply waits for its words; a stored one shows at once. */
  enterDelay: number | null;
  onAct: () => void;
}) {
  const reduced = useReducedMotion();
  const words = cardWords(card, units);
  const entering =
    enterDelay == null
      ? undefined
      : FadeIn.delay(reduced ? 0 : enterDelay)
          .duration(300)
          .easing(EASE_OUT);

  return (
    <Animated.View
      entering={entering}
      className="mt-4 flex-row items-center rounded-[22px] border border-hairline/10 bg-surface py-3.5 pl-5 pr-3">
      <View className="mr-3 flex-1">
        <Text className="font-sans-medium text-[16px] leading-[22px] text-text" numberOfLines={2}>
          {words.title}
        </Text>
        {words.line ? (
          <Text
            className="mt-0.5 font-sans text-[14px] leading-[20px] text-muted"
            numberOfLines={2}>
            {words.line}
          </Text>
        ) : null}
      </View>
      {card.done && words.done ? (
        <Animated.View
          key="done"
          entering={FadeIn.duration(200).easing(EASE_OUT)}
          className="h-10 flex-row items-center px-2">
          <CheckIcon size={18} color={ADVISOR_COLORS.muted} />
          <Text className="ml-1.5 font-sans text-[14px] text-muted">{words.done}</Text>
        </Animated.View>
      ) : (
        <PressScale
          accessibilityRole="button"
          accessibilityLabel={`${words.button}: ${words.title}`}
          onPress={onAct}
          hitSlop={6}
          className="h-10 items-center justify-center rounded-pill bg-text px-4">
          <Text className="font-sans-medium text-[15px] text-bg">{words.button}</Text>
        </PressScale>
      )}
    </Animated.View>
  );
}
