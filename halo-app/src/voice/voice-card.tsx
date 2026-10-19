import { Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { CheckIcon } from '@/components/icons';
import { PressScale } from '@/components/press-scale';
import { useHaloTheme } from '@/theme/theme-provider';

import { allowVoice, type VoiceAccess, useVoiceAccess } from './access';

/** The one place the user agrees that their voice goes to OpenAI, with the mic asked right after. */
export const VOICE_TITLE = 'Talk to Halo';
export const VOICE_LINE =
  'Your voice goes to OpenAI to be understood. Halo doesn’t keep the recording.';

/**
 * Talking to the ring, asked in context under "Keep Halo on screen". Allow is the consent and the
 * mic permission in one tap.
 */
export function VoiceCard({ onAllowed }: { onAllowed?: (access: VoiceAccess) => void }) {
  const { theme } = useHaloTheme();
  const access = useVoiceAccess();
  if (access == null || access === 'unavailable') return null;

  return (
    <View className="mt-3 flex-row items-center rounded-card border border-hairline/10 bg-glass/5 p-4">
      <View className="flex-1 pr-3">
        <Text className="font-sans-medium text-[16px] text-text">{VOICE_TITLE}</Text>
        <Text className="mt-0.5 font-sans text-[14px] leading-[20px] text-muted">{VOICE_LINE}</Text>
      </View>
      {access === 'allowed' ? (
        // Allow → Allowed fades rather than swapping (seen in onboarding; the sheet closes at once).
        <Animated.View
          entering={FadeIn.duration(200)}
          className="flex-row items-center"
          accessibilityLabel="Voice allowed">
          <CheckIcon size={18} color={theme.colors.text} />
          <Text className="ml-1.5 font-sans-medium text-[15px] text-text">Allowed</Text>
        </Animated.View>
      ) : (
        <PressScale
          accessibilityRole="button"
          accessibilityHint="Asks for the microphone"
          onPress={async () => onAllowed?.(await allowVoice())}
          className="rounded-pill bg-glass/10 px-4 py-2">
          <Text className="font-sans-medium text-[15px] text-text">Allow</Text>
        </PressScale>
      )}
    </View>
  );
}
