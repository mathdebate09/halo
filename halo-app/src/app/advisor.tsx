import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { attachMealPhoto, attachReport, type PhotoSource } from '@/advisor/attach';
import { chatItems } from '@/advisor/chat-items';
import { Composer } from '@/advisor/composer';
import { ReplyItem } from '@/advisor/reply-item';
import { useAdvisorSources } from '@/advisor/sources';
import { ADVISOR_COLORS, advisorVars } from '@/advisor/theme';
import { useAdvisorThread } from '@/advisor/thread';
import { UserMessage } from '@/advisor/user-message';
import { ChevronDownIcon } from '@/components/icons';
import { setToastsMuted } from '@/components/toast';
import {
  ADVISOR_ENTRIES,
  ADVISOR_LIMITS,
  type AdvisorEntry,
  dayKey,
  entryQuestion,
  starterQuestion,
} from '@/shared';
import { useStatusBarStyle } from '@/theme/status-bar';

// The Advisor (SPEC §3): today's conversation about the user's own data, on the one light screen.
// Answers arrive a few words at a time; every message is kept on the phone (and synced).

export default function AdvisorScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ from?: string; note?: string }>();
  const entry = (ADVISOR_ENTRIES as readonly string[]).includes(params.from ?? '')
    ? (params.from as AdvisorEntry)
    : null;
  const [day] = useState(() => dayKey(new Date()));
  // Messages from before the screen opened show as they are; new ones fade in.
  const [openedAt] = useState(() => Date.now());
  const { messages, live, failure, send, retry, busy } = useAdvisorThread(day);
  const sources = useAdvisorSources();
  const units = { pounds: sources?.pounds ?? false, clock24: sources?.clock24 ?? true };
  const [draft, setDraft] = useState('');
  const scroll = useRef<ScrollView>(null);

  // A note typed in the logger before opening the Advisor comes along (the user wrote it). The
  // app never writes into the composer itself: its question is a suggestion above it.
  const carried = useRef(false);
  useEffect(() => {
    if (carried.current) return;
    carried.current = true;
    const note = params.note?.trim();
    if (note) setDraft(note.slice(0, ADVISOR_LIMITS.message));
  }, [params.note]);

  // Dark status bar icons: the Advisor is light in either mode.
  useStatusBarStyle('dark');
  // No toasts while the Advisor is open, sheets over it included: it's a conversation, so every
  // result and correction is said in the chat.
  useEffect(() => {
    setToastsMuted(true);
    return () => setToastsMuted(false);
  }, []);

  // The composer rides on the keyboard.
  const keyboard = useAnimatedKeyboard();
  const lift = useAnimatedStyle(() => ({
    height: Math.max(0, keyboard.height.get() - insets.bottom),
  }));

  const addPhoto = async (from: PhotoSource) => {
    if ((await attachMealPhoto(day, from, draft)) && draft) setDraft('');
  };
  // One suggested question, one tap to send: from Vitals, about what the hero leads with (until
  // something is sent here); otherwise, on an empty thread, about today's brief.
  const sentHere = messages.some((m) => m.role === 'user' && m.createdAt > openedAt);
  const fromVitals =
    entry === 'vitals' && sources && !sentHere
      ? entryQuestion(
          entry,
          sources.scores.vitalsReport.areas,
          sources.lab.factors,
          sources.profile?.goal,
        )
      : null;
  const suggestion = live
    ? null
    : (fromVitals ??
      (messages.length === 0 ? starterQuestion(sources?.briefSignal ?? null) : null));

  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const items = chatItems(messages, live);

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
            <ReplyItem key={`a:${item.turnId}`} item={item} units={units} />
          ),
        )}
      </ScrollView>

      <Composer
        draft={draft}
        onChangeDraft={setDraft}
        busy={busy}
        suggestion={suggestion}
        onSend={(text) => void send(text, entry)}
        onPhoto={(from) => void addPhoto(from)}
        onLabReport={() => void attachReport(day)}
      />
      <View style={{ height: insets.bottom }} />
      <Animated.View style={lift} />
    </View>
  );
}
