import { type ReactNode, useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { Easing, FadeIn, useReducedMotion } from 'react-native-reanimated';

import type { Segment, SummaryTab } from '@/shared';

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
/** About the pace a chat answer streams in: readable as it arrives, not a blink. */
const WORD_MS = 90;
const FADE_MS = 220;

/** Texts already revealed this session: they show instantly on revisit (SPEC). */
const seen = new Set<string>();

type Token = { word: string } | { chip: SummaryTab; label: string };

function tokens(segments: Segment[]): Token[] {
  const out: Token[] = [];
  for (const s of segments) {
    if ('m' in s) out.push({ chip: s.m, label: s.v });
    else for (const w of s.t.split(/(?<=\s)/)) if (w) out.push({ word: w });
  }
  return out;
}

type Props = {
  segments: Segment[];
  /** Plays the reveal once this is true (the section has come into view). */
  armed: boolean;
  onChip?: (tab: SummaryTab) => void;
  /** The chip whose metric is shown below it. */
  selected?: SummaryTab;
  chipIcon?: (tab: SummaryTab, active: boolean) => ReactNode;
  size?: 'large' | 'body';
  center?: boolean;
};

/**
 * Text that arrives word by word, the way a chat answer streams, with metric chips as real
 * buttons (an icon and the figure). Plays once per text; revisits and reduced motion show it at
 * once.
 */
export function RevealText({
  segments,
  armed,
  onChip,
  selected,
  chipIcon,
  size = 'body',
  center,
}: Props) {
  const reduced = useReducedMotion();
  const key = JSON.stringify(segments);
  const fresh = !seen.has(key);
  const animate = armed && fresh && !reduced;
  useEffect(() => {
    if (armed) seen.add(key);
  }, [armed, key]);

  const large = size === 'large';
  const textClass = large
    ? 'font-sans text-[20px] leading-[30px] text-text'
    : 'font-sans text-[15px] leading-[22px] text-text/85';

  return (
    // Keyed by armed so the words mount (and animate) when the section is reached.
    <View
      key={`${key}:${armed}`}
      className={`flex-row flex-wrap items-center ${center ? 'justify-center' : ''}`}
      style={{ opacity: armed || !fresh ? 1 : 0 }}>
      {tokens(segments).map((tok, i) => (
        <Animated.View
          key={i}
          entering={
            animate
              ? FadeIn.delay(i * WORD_MS)
                  .duration(FADE_MS)
                  .easing(EASE_OUT)
              : undefined
          }>
          {'word' in tok ? (
            <Text className={textClass}>{tok.word}</Text>
          ) : (
            <Chip
              tab={tok.chip}
              label={tok.label}
              active={selected === tok.chip}
              icon={chipIcon?.(tok.chip, selected === tok.chip)}
              onPress={() => onChip?.(tok.chip)}
            />
          )}
        </Animated.View>
      ))}
    </View>
  );
}

function Chip({
  tab,
  label,
  active,
  icon,
  onPress,
}: {
  tab: SummaryTab;
  label: string;
  active: boolean;
  icon: ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label}, show ${tab}`}
      onPress={onPress}
      hitSlop={4}
      className={`mx-0.5 h-[30px] flex-row items-center rounded-pill border px-2.5 ${active ? 'border-text/60 bg-glass/15' : 'border-hairline/15 active:bg-glass/10'}`}>
      {icon}
      <Text
        className={`font-sans-medium text-[18px] leading-[24px] text-text ${icon ? 'ml-1.5' : ''}`}>
        {label}
      </Text>
    </Pressable>
  );
}
