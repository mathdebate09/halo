import * as Haptics from 'expo-haptics';
import { type ReactNode, type RefObject, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { CheckIcon, DownloadIcon, InstagramIcon, ShareIcon } from '@/components/icons';
import { PressScale } from '@/components/press-scale';
import { showToast } from '@/components/toast';
import { renderCard, saveToGallery, shareImage, shareToStory } from '@/share/export';
import { useHaloTheme } from '@/theme/theme-provider';

type Action = 'story' | 'save' | 'share';

/**
 * The composer's action bar: Story, Save (its glyph turns to a check for a moment) and Share.
 * Each renders the card behind `card` to an image first.
 */
export function ShareActions({ card, height }: { card: RefObject<View | null>; height: number }) {
  const { theme } = useHaloTheme();
  const [busy, setBusy] = useState<Action | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 1800);
    return () => clearTimeout(timer);
  }, [saved]);

  const run = async (kind: Action) => {
    if (busy) return;
    setBusy(kind);
    try {
      const uri = await renderCard(card);
      if (kind === 'save') {
        if (await saveToGallery(uri)) {
          setSaved(true);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
          showToast('Allow Photos access to save');
        }
      } else if (kind === 'share') {
        await shareImage(uri);
      } else {
        await shareToStory(uri);
      }
    } catch {
      showToast("Couldn't make the image");
    } finally {
      setBusy(null);
    }
  };

  return (
    <View className="mt-5 flex-row items-center gap-2.5 px-3" style={{ height, paddingBottom: 0 }}>
      <PressScale
        accessibilityRole="button"
        accessibilityLabel="Share to Instagram Stories"
        onPress={() => run('story')}
        pressableStyle={styles.flex}
        className="h-[56px] flex-row items-center justify-center gap-2.5 rounded-pill bg-white/10">
        <Dim on={busy === 'story'}>
          <InstagramIcon size={22} color={theme.colors.text} />
          <Text className="font-sans-medium text-[15px] tracking-[1px] text-text">STORY</Text>
        </Dim>
      </PressScale>
      <PressScale
        accessibilityRole="button"
        accessibilityLabel="Save to Photos"
        onPress={() => run('save')}
        pressableStyle={styles.flex}
        className="h-[56px] flex-row items-center justify-center gap-2.5 rounded-pill bg-white/10">
        <Dim on={busy === 'save'}>
          {/* The download glyph turns into a check for a moment once the image is saved. */}
          <Animated.View
            key={saved ? 'saved' : 'save'}
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(150)}>
            {saved ? (
              <CheckIcon size={22} color={theme.colors.text} />
            ) : (
              <DownloadIcon size={22} color={theme.colors.text} />
            )}
          </Animated.View>
          <Text className="font-sans-medium text-[15px] tracking-[1px] text-text">
            {saved ? 'SAVED' : 'SAVE'}
          </Text>
        </Dim>
      </PressScale>
      <PressScale
        accessibilityRole="button"
        accessibilityLabel="Share"
        onPress={() => run('share')}
        className="h-[60px] w-[60px] items-center justify-center rounded-full bg-white">
        <Dim on={busy === 'share'}>
          <ShareIcon size={24} color="#111111" />
        </Dim>
      </PressScale>
    </View>
  );
}

/** Dims an action's content while its image renders (~300 ms), so the press visibly took. */
function Dim({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <Animated.View
      style={[
        styles.row,
        {
          opacity: on ? 0.5 : 1,
          transitionProperty: 'opacity',
          transitionDuration: 150,
          transitionTimingFunction: 'ease-out',
        },
      ]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flex: { flex: 1 },
});
