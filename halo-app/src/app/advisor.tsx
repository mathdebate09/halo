import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedKeyboard,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { actOnCard, correctCard, type StoredCard } from '@/advisor/act';
import { attachMealPhoto, attachReport, type PhotoSource } from '@/advisor/attach';
import { AdvisorCardView, MealPhotoCard, ReportChatCard } from '@/advisor/card';
import { Reply, Thinking, WORD_MS } from '@/advisor/reply';
import { useAdvisorSources } from '@/advisor/sources';
import { ADVISOR_COLORS, advisorVars } from '@/advisor/theme';
import { type AdvisorMessage, type Failure, useAdvisorThread } from '@/advisor/thread';
import { ArrowUpIcon, ChevronDownIcon, PlusIcon, ReportIcon } from '@/components/icons';
import { MicButton } from '@/components/mic-button';
import { PressScale } from '@/components/press-scale';
import { setToastsMuted } from '@/components/toast';
import { useDictation } from '@/lib/dictation';
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
  // Speaking into the composer (on the phone); the words land in the field to read and send.
  const dictation = useDictation(draft, setDraft);
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

  const canSend = draft.trim().length > 0 && !busy;
  const submit = () => {
    if (!canSend) return;
    dictation.cancel();
    void send(draft, entry);
    setDraft('');
  };
  // The +: a meal photo (camera or library) or a lab report, straight into the chat.
  const [adding, setAdding] = useState(false);
  const addPhoto = async (from: PhotoSource) => {
    setAdding(false);
    Keyboard.dismiss();
    if ((await attachMealPhoto(day, from, draft)) && draft) setDraft('');
  };
  const addLabReport = () => {
    setAdding(false);
    Keyboard.dismiss();
    void attachReport(day);
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
  const starter =
    live || draft || adding || dictation.listening
      ? null
      : (fromVitals ??
        (messages.length === 0 ? starterQuestion(sources?.briefSignal ?? null) : null));

  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  type Item =
    | { kind: 'user'; message: AdvisorMessage }
    | {
        kind: 'reply';
        turnId: string;
        text: string;
        live: boolean;
        status: string | null;
        card: StoredCard | null;
        message: AdvisorMessage | null;
      };
  const items: Item[] = messages.map((m) =>
    m.role === 'user'
      ? { kind: 'user', message: m }
      : {
          kind: 'reply',
          turnId: m.turnId ?? m.id,
          text: m.content,
          live: false,
          status: null,
          card: m.cards?.[0] ?? null,
          message: m,
        },
  );
  if (live && !messages.some((m) => m.role === 'assistant' && m.turnId === live.turnId)) {
    items.push({
      kind: 'reply',
      turnId: live.turnId,
      text: live.sentences.join(' '),
      live: true,
      status: live.status,
      card: live.card,
      message: null,
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
              {item.card && item.text ? (
                <AdvisorCardView
                  card={item.card}
                  units={units}
                  // While streaming, the card waits for the reply's words to land.
                  enterDelay={item.live ? item.text.split(/\s+/).length * WORD_MS + 260 : null}
                  onAct={() => {
                    Keyboard.dismiss();
                    if (item.card && item.message) void actOnCard(item.card, item.message);
                  }}
                  onCorrect={() => {
                    if (item.card && item.message) correctCard(item.card, item.message);
                  }}
                />
              ) : null}
            </View>
          ),
        )}
      </ScrollView>

      <View className="px-4 pb-2 pt-2">
        {adding ? (
          <Animated.View
            entering={FadeIn.duration(200).easing(EASE_OUT)}
            className="mb-3 flex-row gap-2">
            {(
              [
                ['Camera', () => void addPhoto('camera')],
                ['Photos', () => void addPhoto('library')],
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
              onPress={() => void send(starter, entry)}
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
            onChangeText={setDraft}
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
  const attachment = message.attachment;
  return (
    <View className="mb-6 items-end">
      {attachment?.kind === 'meal' && attachment.photoUri ? (
        <Animated.View
          entering={fresh ? FadeIn.duration(260).easing(EASE_OUT) : undefined}
          className="mb-2">
          <Image
            source={{ uri: attachment.photoUri }}
            style={styles.photo}
            contentFit="cover"
            accessibilityLabel="Meal photo"
          />
        </Animated.View>
      ) : null}
      {attachment?.kind === 'report' ? (
        <Animated.View
          entering={fresh ? FadeIn.duration(260).easing(EASE_OUT) : undefined}
          className="mb-2 flex-row items-center rounded-[22px] bg-glass/[0.07] px-4 py-3">
          <ReportIcon size={18} color={ADVISOR_COLORS.text} />
          <Text className="ml-2 font-sans text-[16px] text-text">Lab report</Text>
        </Animated.View>
      ) : null}
      {message.content ? (
        <Animated.View
          entering={fresh ? FadeIn.duration(260).easing(EASE_OUT) : undefined}
          className="max-w-[85%] rounded-[22px] bg-glass/[0.07] px-4 py-3">
          <Text className="font-sans text-[16px] leading-[23px] text-text" selectable>
            {message.content}
          </Text>
        </Animated.View>
      ) : null}
      {/* What the attachment became, said like a reply. */}
      {attachment?.kind === 'meal' ? (
        <View className="self-stretch">
          <MealPhotoCard mealId={attachment.mealId} />
        </View>
      ) : null}
      {attachment?.kind === 'report' ? (
        <View className="self-stretch">
          <ReportChatCard reportId={attachment.reportId} />
        </View>
      ) : null}
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
  add: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  photo: { width: 200, height: 200, borderRadius: 20 },
  send: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ADVISOR_COLORS.text,
  },
});
