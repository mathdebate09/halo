import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeIn } from 'react-native-reanimated';

import { MealPhotoCard, ReportChatCard } from '@/advisor/card';
import { ADVISOR_COLORS } from '@/advisor/theme';
import type { AdvisorMessage, Failure } from '@/advisor/thread';
import { ReportIcon } from '@/components/icons';

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

const FAILURE_WORDS: Record<Failure['code'], string> = {
  busy: 'Still answering the last one.',
  unavailable: 'No answer right now.',
  timeout: 'That took too long.',
  failed: 'No answer this time.',
  no_plan: 'Finish your plan first.',
};

export function UserMessage({
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
  photo: { width: 200, height: 200, borderRadius: 20 },
});
