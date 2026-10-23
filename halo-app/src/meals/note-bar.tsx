import { useEffect } from 'react';
import { Text, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { ArrowUpIcon } from '@/components/icons';
import { MicButton } from '@/components/mic-button';
import { PressScale } from '@/components/press-scale';
import { useDictation } from '@/lib/dictation';
import type { LoggerMode } from '@/meals/use-active-meal';
import { useHaloTheme } from '@/theme/theme-provider';

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

/**
 * The note bar under the card. While the AI works it converges into a small "Analysing" pill
 * (a layout transition), then opens back up as the place to ask for a correction.
 */
export function NoteBar({
  mode,
  note,
  onChangeNote,
  canSend,
  onSend,
}: {
  mode: LoggerMode;
  note: string;
  onChangeNote: (note: string) => void;
  canSend: boolean;
  onSend: () => void;
}) {
  const { theme } = useHaloTheme();
  const analysing = mode === 'analysing';
  // Speaking the note (on the phone): the words land in the field, then Send as usual.
  const dictation = useDictation(note, onChangeNote);
  const send = () => {
    dictation.cancel();
    onSend();
  };
  return (
    <Animated.View
      layout={LinearTransition.duration(450).easing(EASE_OUT)}
      className={`mt-4 min-h-[56px] flex-row items-center rounded-[28px] border border-hairline/10 bg-glass/10 ${analysing ? 'self-center px-6' : 'self-stretch py-1.5 pl-5 pr-1.5'}`}>
      {analysing ? (
        <Animated.View
          key="analysing"
          entering={FadeIn.duration(300).delay(200)}
          exiting={FadeOut.duration(150)}
          accessibilityLiveRegion="polite"
          className="flex-row items-center">
          <Text className="font-sans-medium text-[16px] text-text">Analysing</Text>
          <WaveDots color={theme.colors.text} />
        </Animated.View>
      ) : (
        <Animated.View
          key="input"
          entering={FadeIn.duration(300).delay(200)}
          exiting={FadeOut.duration(150)}
          className="flex-1 flex-row items-end">
          <TextInput
            value={note}
            onChangeText={onChangeNote}
            placeholder={
              dictation.listening
                ? 'Listening…'
                : (dictation.hint ??
                  (mode === 'result' ? 'Something off? Tell me what to fix' : 'Add a note'))
            }
            placeholderTextColor={theme.colors.muted}
            multiline
            maxLength={280}
            className="max-h-24 flex-1 py-2.5 font-sans text-[16px] text-text"
            accessibilityLabel={mode === 'result' ? 'Correction for the analysis' : 'Meal note'}
          />
          {dictation.available ? (
            <View className="mr-1.5">
              <MicButton
                listening={dictation.listening}
                level={dictation.level}
                onPress={dictation.toggle}
                color={theme.colors.text}
                fill={theme.colors.bg}
                size={44}
                offset={0}
              />
            </View>
          ) : null}
          <PressScale
            accessibilityRole="button"
            accessibilityLabel={mode === 'result' ? 'Re-analyse' : 'Analyse meal'}
            accessibilityState={{ disabled: !canSend }}
            disabled={!canSend}
            onPress={send}
            className={`h-11 w-11 items-center justify-center rounded-full bg-text ${canSend ? '' : 'opacity-30'}`}>
            <ArrowUpIcon size={22} color={theme.colors.bg} />
          </PressScale>
        </Animated.View>
      )}
    </Animated.View>
  );
}

/** Three dots rising and falling in a wave (still under reduced motion). */
function WaveDots({ color }: { color: string }) {
  return (
    <View className="ml-2 flex-row items-end gap-1" style={{ height: 14 }}>
      {[0, 1, 2].map((i) => (
        <WaveDot key={i} index={i} color={color} />
      ))}
    </View>
  );
}

function WaveDot({ index, color }: { index: number; color: string }) {
  const reduced = useReducedMotion();
  const y = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    y.set(
      withDelay(
        index * 140,
        withRepeat(
          withSequence(
            withTiming(-5, { duration: 320, easing: Easing.inOut(Easing.sin) }),
            withTiming(0, { duration: 320, easing: Easing.inOut(Easing.sin) }),
            withTiming(0, { duration: 260 }),
          ),
          -1,
        ),
      ),
    );
  }, [reduced, index, y]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));
  return (
    <Animated.View
      style={[{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: color }, style]}
    />
  );
}
