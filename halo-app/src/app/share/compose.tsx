import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChevronLeftIcon, EyeIcon, PlusIcon } from '@/components/icons';
import { PressScale } from '@/components/press-scale';
import type { Background } from '@/share/photo';
import { PhotoLayer } from '@/share/photo-layer';
import { PresetSheet } from '@/share/preset-sheet';
import { presetById } from '@/share/presets';
import { ShareActions } from '@/share/share-actions';
import { shareSnapshot } from '@/share/snapshot';
import { Sticker, TrashZone, useDragState, useHiddenWhileDragging } from '@/share/sticker';
import { useStickers } from '@/share/use-stickers';
import type { Tier } from '@/theme/themes';

const BAR = 64;
/** The + pill's centre from the card's bottom edge (the trash takes its place while dragging). */
const PLUS_FROM_BOTTOM = 92;
const SHEET_DELAY = 350;

export default function Compose() {
  const params = useLocalSearchParams<{ uri?: string; w?: string; h?: string; gradient?: Tier }>();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
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

  const { stickers, add, raise, cycle, remove } = useStickers();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [watermark, setWatermark] = useState(true);

  // The presets rise on their own once the card has settled in.
  useEffect(() => {
    const timer = setTimeout(() => setSheetOpen(true), SHEET_DELAY);
    return () => clearTimeout(timer);
  }, []);

  // Only after a dev reload: there's no day to share, so go back.
  useEffect(() => {
    if (!snapshot) router.back();
  }, [snapshot]);
  if (!snapshot) return null;

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
                onRaise={() => raise(s.key)}
                onTap={() => cycle(s.key)}
                onRemove={() => remove(s.key)}>
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

      <ShareActions card={card} height={BAR} />

      <PresetSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onPick={(preset) => {
          add(preset.id);
          setSheetOpen(false);
        }}
        snapshot={snapshot}
        width={window.width}
        height={window.height}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  mark: { position: 'absolute', left: 0, right: 0, bottom: 20 },
  foot: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  markShadow: {
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
});
