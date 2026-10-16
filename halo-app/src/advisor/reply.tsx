import { useEffect, useRef } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);
/** Words arrive at about the pace a reply is read; Learn more's reveal uses 90 ms. */
const WORD_MS = 60;
const FADE_MS = 260;

const TEXT = 'font-sans text-[17px] leading-[26px] text-text';

/**
 * A reply. While it streams, each new word fades in after the ones before it; words already shown
 * stay put when more arrive (or when the stored reply takes over, under the same key). A stored
 * reply opened later shows at once.
 */
export function Reply({ text, live }: { text: string; live: boolean }) {
  const reduced = useReducedMotion();
  // Fixed at mount: a reply that was already there never animates.
  const animated = useRef(live && !reduced).current;
  // How many words were on screen before this render, so only new ones wait their turn.
  const before = useRef(0);
  const words = text.split(/(?<=\s)/).filter(Boolean);
  const start = before.current;
  useEffect(() => {
    before.current = words.length;
  });

  if (!animated) {
    return (
      <Text className={TEXT} selectable>
        {text}
      </Text>
    );
  }
  return (
    <View accessible accessibilityLabel={text} className="flex-row flex-wrap">
      {words.map((word, i) => (
        <Animated.View
          key={i}
          entering={FadeIn.delay(Math.max(0, i - start) * WORD_MS)
            .duration(FADE_MS)
            .easing(EASE_OUT)}>
          <Text className={TEXT}>{word}</Text>
        </Animated.View>
      ))}
    </View>
  );
}

/** What's being read while the reply is on its way, over a softly breathing dot. */
export function Thinking({ label }: { label: string | null }) {
  const reduced = useReducedMotion();
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (reduced) return;
    pulse.set(withRepeat(withTiming(0.35, { duration: 900, easing: EASE_IN_OUT }), -1, true));
  }, [pulse, reduced]);
  const dot = useAnimatedStyle(() => ({ opacity: pulse.get() }));

  return (
    <View accessibilityLiveRegion="polite" className="h-7 flex-row items-center">
      <Animated.View style={[{ width: 8, height: 8, borderRadius: 4 }, dot]}>
        <View className="h-2 w-2 rounded-pill bg-text/50" />
      </Animated.View>
      {label ? (
        <Animated.View key={label} entering={FadeIn.duration(260).easing(EASE_OUT)}>
          <Text className="ml-2.5 font-sans text-[15px] text-muted">{label}</Text>
        </Animated.View>
      ) : null}
    </View>
  );
}
