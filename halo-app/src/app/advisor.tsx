import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedKeyboard,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Reply, Thinking } from '@/advisor/reply';
import { ADVISOR_COLORS, advisorVars } from '@/advisor/theme';
import { type AdvisorMessage, type Failure, useAdvisorThread } from '@/advisor/thread';
import { ArrowUpIcon, ChevronDownIcon } from '@/components/icons';
import { PressScale } from '@/components/press-scale';
import { ADVISOR_ENTRIES, ADVISOR_LIMITS, type AdvisorEntry, dayKey } from '@/shared';

// The Advisor (SPEC §3): today's conversation about the user's own data, on the one light screen.
// Answers arrive a few words at a time; every message is kept on the phone (and synced).

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

const FAILURE_WORDS: Record<Failure['code'], string> = {
  busy: 'Still answering the last one.',
  unavailable: 'No answer right now.',
  timeout: 'That took too long.',
  failed: 'No answer this time.',
  no_plan: 'Finish your plan first.',
};

export default function AdvisorScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ from?: string }>();
  const entry = (ADVISOR_ENTRIES as readonly string[]).includes(params.from ?? '')
    ? (params.from as AdvisorEntry)
    : null;
  const [day] = useState(() => dayKey(new Date()));
  // Messages from before the screen opened show as they are; new ones fade in.
  const [openedAt] = useState(() => Date.now());
  const { messages, live, failure, send, retry, busy } = useAdvisorThread(day);
  const [draft, setDraft] = useState('');
  const scroll = useRef<ScrollView>(null);

  // Dark status bar on this light screen only.
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('dark', true);
      return () => setStatusBarStyle('light', true);
    }, []),
  );

  // The composer rides on the keyboard.
  const keyboard = useAnimatedKeyboard();
  const lift = useAnimatedStyle(() => ({
    height: Math.max(0, keyboard.height.get() - insets.bottom),
  }));

  const canSend = draft.trim().length > 0 && !busy;
  const submit = () => {
    if (!canSend) return;
    send(draft, entry);
    setDraft('');
  };

  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  type Item =
    | { kind: 'user'; message: AdvisorMessage }
    | { kind: 'reply'; turnId: string; text: string; live: boolean; status: string | null };
  const items: Item[] = messages.map((m) =>
    m.role === 'user'
      ? { kind: 'user', message: m }
      : { kind: 'reply', turnId: m.turnId ?? m.id, text: m.content, live: false, status: null },
  );
  if (live && !messages.some((m) => m.role === 'assistant' && m.turnId === live.turnId)) {
    items.push({
      kind: 'reply',
      turnId: live.turnId,
      text: live.sentences.join(' '),
      live: true,
      status: live.status,
    });
  }

  return (
    <View style={[advisorVars, { flex: 1, backgroundColor: ADVISOR_COLORS.bg }]}>
      <View className="flex-row items-center px-4" style={{ paddingTop: insets.top + 8 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={() => router.back()}
          hitSlop={8}
          className="h-11 w-11 items-center justify-center rounded-full active:bg-glass/10">
          <ChevronDownIcon size={24} color={ADVISOR_COLORS.text} />
        </Pressable>
      </View>

      <ScrollView
        ref={scroll}
        className="flex-1"
        contentContainerClassName="px-6 pb-6"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
        <Text accessibilityRole="header" className="mb-6 mt-2 font-serif text-[44px] text-text">
          Advisor
        </Text>
        {items.map((item) =>
          item.kind === 'user' ? (
            <UserMessage
              key={item.message.id}
              message={item.message}
              fresh={item.message.createdAt > openedAt}
              failure={failure?.messageId === item.message.id ? failure : null}
              showRetry={
                item.message.status === 'failed' && item.message.id === lastUser?.id && !busy
              }
              onRetry={() => retry(item.message)}
            />
          ) : (
            // Keyed by turn: the streamed reply and the stored one are the same view, so the words
            // already shown stay and the fade carries on.
            <View key={`a:${item.turnId}`} className="mb-6">
              {item.text ? (
                <Reply text={item.text} live={item.live} />
              ) : (
                <Thinking label={item.status} />
              )}
            </View>
          ),
        )}
      </ScrollView>

      <View className="px-4 pb-2 pt-2">
        <View className="flex-row items-end rounded-[26px] border border-hairline/10 bg-surface pl-5 pr-1.5">
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Ask about today"
            placeholderTextColor={ADVISOR_COLORS.muted}
            accessibilityLabel="Message"
            multiline
            maxLength={ADVISOR_LIMITS.message}
            className="max-h-32 flex-1 py-3.5 font-sans text-[17px] text-text"
          />
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
      <View style={{ height: insets.bottom }} />
      <Animated.View style={lift} />
    </View>
  );
}

function UserMessage({
  message,
  fresh,
  failure,
  showRetry,
  onRetry,
}: {
  message: AdvisorMessage;
  fresh: boolean;
  failure: Failure | null;
  showRetry: boolean;
  onRetry: () => void;
}) {
  return (
    <View className="mb-6 items-end">
      <Animated.View
        entering={fresh ? FadeIn.duration(260).easing(EASE_OUT) : undefined}
        className="max-w-[85%] rounded-[22px] bg-glass/[0.07] px-4 py-3">
        <Text className="font-sans text-[16px] leading-[23px] text-text" selectable>
          {message.content}
        </Text>
      </Animated.View>
      {showRetry ? (
        <Animated.View
          entering={FadeIn.duration(200).easing(EASE_OUT)}
          className="mt-2 flex-row items-center">
          <Text className="font-sans text-[14px] text-muted">
            {FAILURE_WORDS[failure?.code ?? 'failed']}
          </Text>
          {failure?.code !== 'no_plan' ? (
            <Pressable accessibilityRole="button" onPress={onRetry} hitSlop={8} className="ml-2">
              <Text className="font-sans-medium text-[14px] text-accent">Try again</Text>
            </Pressable>
          ) : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sendSpot: { marginBottom: 6 },
  send: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ADVISOR_COLORS.text,
  },
});
