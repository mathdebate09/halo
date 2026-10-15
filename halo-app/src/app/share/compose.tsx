import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  CheckIcon,
  ChevronLeftIcon,
  DownloadIcon,
  EyeIcon,
  InstagramIcon,
  PlusIcon,
  ShareIcon,
} from '@/components/icons';
import { PressScale } from '@/components/press-scale';
import { showToast } from '@/components/toast';
import { renderCard, saveToGallery, shareImage, shareToStory } from '@/share/export';
import type { Background } from '@/share/photo';
import { PhotoLayer } from '@/share/photo-layer';
import { PresetSheet } from '@/share/preset-sheet';
import { nextVariant, presetById, type Variant } from '@/share/presets';
import { shareSnapshot } from '@/share/snapshot';
import { Sticker, TrashZone, useDragState, useHiddenWhileDragging } from '@/share/sticker';
import { useHaloTheme } from '@/theme/theme-provider';
import type { Tier } from '@/theme/themes';

const BAR = 64;
/** The + pill's centre from the card's bottom edge (the trash takes its place while dragging). */
const PLUS_FROM_BOTTOM = 92;
const SHEET_DELAY = 350;

type Placed = { key: number; presetId: string; variant: Variant; z: number };

export default function Compose() {
  const params = useLocalSearchParams<{ uri?: string; w?: string; h?: string; gradient?: Tier }>();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const { theme } = useHaloTheme();
  const snapshot = shareSnapshot();

  const background: Background = params.gradient
    ? { kind: 'gradient', tier: params.gradient }
    : { kind: 'photo', uri: params.uri ?? '', width: Number(params.w), height: Number(params.h) };

  // The largest 9:16 card that fits between the status bar and the action bar.
  const room = window.height - insets.top - 8 - (BAR + 20) - insets.bottom;
  const cardW = Math.min(window.width - 16, (room * 9) / 16);
  const cardH = (cardW * 16) / 9;

  const card = useRef<View>(null);
  const clip = useRef<View>(null);
  const drag = useDragState(cardW, cardH);
  const plusStyle = useHiddenWhileDragging(drag);

  const [stickers, setStickers] = useState<Placed[]>([]);
  const nextKey = useRef(1);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [watermark, setWatermark] = useState(true);
  const [busy, setBusy] = useState<'story' | 'save' | 'share' | null>(null);
  const [saved, setSaved] = useState(false);

  // The presets rise on their own once the card has settled in.
  useEffect(() => {
    const timer = setTimeout(() => setSheetOpen(true), SHEET_DELAY);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 1800);
    return () => clearTimeout(timer);
  }, [saved]);

  // Only after a dev reload: there's no day to share, so go back.
  useEffect(() => {
    if (!snapshot) router.back();
  }, [snapshot]);
  if (!snapshot) return null;

  const topZ = (list: Placed[]) => Math.max(0, ...list.map((s) => s.z)) + 1;
  const add = (presetId: string) => {
    const key = nextKey.current++;
    setStickers((list) => [...list, { key, presetId, variant: 'light', z: topZ(list) }]);
    setSheetOpen(false);
  };
  const update = (key: number, change: (s: Placed, list: Placed[]) => Partial<Placed>) =>
    setStickers((list) => list.map((s) => (s.key === key ? { ...s, ...change(s, list) } : s)));

  const run = async (kind: 'story' | 'save' | 'share') => {
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
    <View className="flex-1 bg-black" style={{ paddingTop: insets.top + 8 }}>
      {/* The rounded clip is only for the screen; the capture is the square-cornered card inside. */}
      <View
        ref={clip}
        className="self-center overflow-hidden rounded-card"
        style={{ width: cardW, height: cardH }}
        onLayout={() => {
          clip.current?.measureInWindow((x, y) => {
            drag.originX.set(x);
            drag.originY.set(y);
          });
        }}>
        <View ref={card} collapsable={false} style={{ width: cardW, height: cardH }}>
          <PhotoLayer background={background} width={cardW} height={cardH} />
          {/* A soft foot so the wordmark and light stickers read over bright photos. */}
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.45)']}
            style={[styles.foot, { height: cardH * 0.3 }]}
          />
          {/* Fades with its toggle (NativeWind drops `style` beside `className` on Animated views). */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.mark,
              {
                opacity: watermark ? 1 : 0,
                transitionProperty: 'opacity',
                transitionDuration: 200,
                transitionTimingFunction: 'ease-out',
              },
            ]}>
            <Text
              className="text-center font-wordmark text-[24px] text-white/60"
              style={styles.markShadow}>
              ShareHalo
            </Text>
          </Animated.View>
          {stickers.map((s) => {
            const preset = presetById(s.presetId);
            if (!preset) return null;
            return (
              <Sticker
                key={s.key}
                drag={drag}
                z={s.z}
                onRaise={() => update(s.key, (_, list) => ({ z: topZ(list) }))}
                onTap={() => update(s.key, (p) => ({ variant: nextVariant(p.variant) }))}
                onRemove={() => setStickers((list) => list.filter((x) => x.key !== s.key))}>
                {preset.render(snapshot, s.variant)}
              </Sticker>
            );
          })}
        </View>

        {/* Controls over the card, outside the capture. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          className="absolute left-3 top-3 h-11 w-11 items-center justify-center rounded-full bg-black/35">
          <ChevronLeftIcon size={24} color="#FFFFFF" />
        </Pressable>
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel="ShareHalo wordmark"
          accessibilityState={{ checked: watermark }}
          onPress={() => setWatermark((w) => !w)}
          className="absolute right-3 top-3 h-11 w-11 items-center justify-center rounded-full bg-black/35">
          <EyeIcon size={22} color="#FFFFFF" off={!watermark} />
        </Pressable>
        <Animated.View
          pointerEvents="box-none"
          className="absolute inset-x-0 items-center"
          style={[{ top: cardH - PLUS_FROM_BOTTOM - 26 }, plusStyle]}>
          <PressScale
            accessibilityRole="button"
            accessibilityLabel="Add a sticker"
            onPress={() => setSheetOpen(true)}
            className="h-[52px] w-[120px] items-center justify-center rounded-pill border border-white/15 bg-black/35">
            <PlusIcon size={26} color="#FFFFFF" />
          </PressScale>
        </Animated.View>
        <TrashZone drag={drag} />
      </View>

      <View
        className="mt-5 flex-row items-center gap-2.5 px-3"
        style={{ height: BAR, paddingBottom: 0 }}>
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

      <PresetSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onPick={(preset) => add(preset.id)}
        snapshot={snapshot}
        width={window.width}
        height={window.height}
      />
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
  mark: { position: 'absolute', left: 0, right: 0, bottom: 20 },
  flex: { flex: 1 },
  foot: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  markShadow: {
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
});
