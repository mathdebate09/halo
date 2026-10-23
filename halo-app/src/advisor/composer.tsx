import { useState } from 'react';
import { Keyboard, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { Easing, FadeIn } from 'react-native-reanimated';

import type { PhotoSource } from '@/advisor/attach';
import { ADVISOR_COLORS } from '@/advisor/theme';
import { ArrowUpIcon, PlusIcon } from '@/components/icons';
import { MicButton } from '@/components/mic-button';
import { PressScale } from '@/components/press-scale';
import { useDictation } from '@/lib/dictation';
import { ADVISOR_LIMITS } from '@/shared';

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

/**
 * The Advisor's foot: the + menu (meal photo or lab report), one suggested question to send in a
 * tap, and the message box with the mic and Send. The suggestion steps aside while the user is
 * typing, speaking or adding.
 */
export function Composer({
  draft,
  onChangeDraft,
  busy,
  suggestion,
  onSend,
  onPhoto,
  onLabReport,
}: {
  draft: string;
  onChangeDraft: (draft: string) => void;
  busy: boolean;
  suggestion: string | null;
  onSend: (text: string) => void;
  onPhoto: (from: PhotoSource) => void;
  onLabReport: () => void;
}) {
  // Speaking into the composer (on the phone); the words land in the field to read and send.
  const dictation = useDictation(draft, onChangeDraft);
  const [adding, setAdding] = useState(false);

  const canSend = draft.trim().length > 0 && !busy;
  const submit = () => {
    if (!canSend) return;
    dictation.cancel();
    onSend(draft);
    onChangeDraft('');
  };
  // The +: a meal photo (camera or library) or a lab report, straight into the chat.
  const addPhoto = (from: PhotoSource) => {
    setAdding(false);
    Keyboard.dismiss();
    onPhoto(from);
  };
  const addLabReport = () => {
    setAdding(false);
    Keyboard.dismiss();
    onLabReport();
  };
  const starter = draft || adding || dictation.listening ? null : suggestion;

  return (
    <View className="px-4 pb-2 pt-2">
      {adding ? (
        <Animated.View
          entering={FadeIn.duration(200).easing(EASE_OUT)}
          className="mb-3 flex-row gap-2">
          {(
            [
              ['Camera', () => addPhoto('camera')],
              ['Photos', () => addPhoto('library')],
              ['Lab report', addLabReport],
            ] as const
          ).map(([label, onPress]) => (
            <PressScale
              key={label}
              accessibilityRole="button"
              onPress={onPress}
              className="rounded-pill border border-hairline/15 px-4 py-2.5">
              <Text className="font-sans text-[15px] text-text">{label}</Text>
            </PressScale>
          ))}
        </Animated.View>
      ) : null}
      {starter ? (
        <Animated.View entering={FadeIn.duration(260).easing(EASE_OUT)} className="mb-3 flex-row">
          <PressScale
            accessibilityRole="button"
            accessibilityHint="Sends this question"
            onPress={() => onSend(starter)}
            className="rounded-pill border border-hairline/15 px-4 py-2.5">
            <Text className="font-sans text-[15px] text-text">{starter}</Text>
          </PressScale>
        </Animated.View>
      ) : null}
      <View className="flex-row items-end rounded-[26px] border border-hairline/10 bg-surface pl-1.5 pr-1.5">
        <PressScale
          accessibilityRole="button"
          accessibilityLabel={adding ? 'Close' : 'Add a photo or a lab report'}
          onPress={() => setAdding((a) => !a)}
          hitSlop={6}
          pressableStyle={styles.sendSpot}>
          <Animated.View
            style={[
              styles.add,
              {
                transform: [{ rotate: adding ? '45deg' : '0deg' }],
                transitionProperty: 'transform',
                transitionDuration: 200,
                transitionTimingFunction: 'ease-out',
              },
            ]}>
            <PlusIcon size={22} color={ADVISOR_COLORS.text} />
          </Animated.View>
        </PressScale>
        <TextInput
          value={draft}
          onChangeText={onChangeDraft}
          placeholder={dictation.listening ? 'Listening…' : (dictation.hint ?? 'Ask about today')}
          placeholderTextColor={ADVISOR_COLORS.muted}
          accessibilityLabel="Message"
          multiline
          maxLength={ADVISOR_LIMITS.message}
          className="ml-1 max-h-32 flex-1 py-3.5 font-sans text-[17px] text-text"
        />
        {dictation.available ? (
          <MicButton
            listening={dictation.listening}
            level={dictation.level}
            onPress={() => {
              setAdding(false);
              dictation.toggle();
            }}
            color={ADVISOR_COLORS.text}
            fill={ADVISOR_COLORS.bg}
          />
        ) : null}
        <PressScale
          accessibilityRole="button"
          accessibilityLabel="Send"
          accessibilityState={{ disabled: !canSend }}
          disabled={!canSend}
          onPress={submit}
          hitSlop={6}
          pressableStyle={styles.sendSpot}>
          <Animated.View
            style={[
              styles.send,
              {
                opacity: canSend ? 1 : 0.25,
                transitionProperty: 'opacity',
                transitionDuration: 200,
              },
            ]}>
            <ArrowUpIcon size={20} color={ADVISOR_COLORS.bg} />
          </Animated.View>
        </PressScale>
      </View>
      <Text className="mt-2 text-center font-sans text-[12px] text-muted">
        General guidance, not medical advice.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sendSpot: { marginBottom: 6 },
  add: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  send: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ADVISOR_COLORS.text,
  },
});
