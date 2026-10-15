// The card's background photo: drag and pinch to frame it. It always covers the card (no edges
// ever show); a pinch below cover springs back on release.

import { LinearGradient } from 'expo-linear-gradient';
import { Image, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { tierGradients } from '@/theme/themes';

import type { Background } from './photo';

const MAX_ZOOM = 4;
/** How far under cover a pinch may go before it resists (springs back on release). */
const MIN_PINCH = 0.85;
const SNAP_BACK = { duration: 400, dampingRatio: 0.8 };
const RESIST = 0.3;

type Props = { background: Background; width: number; height: number };

export function PhotoLayer({ background, width, height }: Props) {
  if (background.kind === 'gradient') {
    const [top, mid, bottom] = tierGradients[background.tier];
    return <LinearGradient colors={[top, mid, bottom]} style={StyleSheet.absoluteFill} />;
  }
  return <PannablePhoto photo={background} width={width} height={height} />;
}

function PannablePhoto({
  photo,
  width,
  height,
}: {
  photo: Extract<Background, { kind: 'photo' }>;
  width: number;
  height: number;
}) {
  // Size at zoom 1: the smallest that covers the card.
  const cover = Math.max(width / photo.width, height / photo.height);
  const baseW = photo.width * cover;
  const baseH = photo.height * cover;

  const zoom = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const lastPinch = useSharedValue(1);

  /** How far the photo may move each way at a zoom and still cover the card. */
  const bounds = (z: number) => {
    'worklet';
    return {
      x: Math.max(0, (baseW * Math.max(1, z) - width) / 2),
      y: Math.max(0, (baseH * Math.max(1, z) - height) / 2),
    };
  };
  const within = (v: number, max: number) => {
    'worklet';
    return Math.min(max, Math.max(-max, v));
  };

  /** Keeps the photo over the whole card at the given zoom. */
  const clamp = (z: number) => {
    'worklet';
    const b = bounds(z);
    tx.set(within(tx.get(), b.x));
    ty.set(within(ty.get(), b.y));
  };

  // Past an edge the photo follows the finger at a third of the speed, then springs back to it.
  const pan = Gesture.Pan()
    .averageTouches(true)
    .onChange((e) => {
      const b = bounds(zoom.get());
      tx.set(tx.get() + e.changeX * (Math.abs(tx.get()) > b.x ? RESIST : 1));
      ty.set(ty.get() + e.changeY * (Math.abs(ty.get()) > b.y ? RESIST : 1));
    })
    .onEnd((e) => {
      const b = bounds(zoom.get());
      const x = within(tx.get(), b.x);
      const y = within(ty.get(), b.y);
      if (x !== tx.get()) tx.set(withSpring(x, { ...SNAP_BACK, velocity: e.velocityX }));
      if (y !== ty.get()) ty.set(withSpring(y, { ...SNAP_BACK, velocity: e.velocityY }));
    });

  // Zooms about the fingers: the point under the focal stays under it.
  const pinch = Gesture.Pinch()
    .onStart(() => {
      lastPinch.set(1);
    })
    .onUpdate((e) => {
      const ratio = e.scale / lastPinch.get();
      lastPinch.set(e.scale);
      const before = zoom.get();
      const after = Math.min(MAX_ZOOM, Math.max(MIN_PINCH, before * ratio));
      const k = after / before;
      const fx = e.focalX - width / 2;
      const fy = e.focalY - height / 2;
      tx.set(fx - (fx - tx.get()) * k);
      ty.set(fy - (fy - ty.get()) * k);
      zoom.set(after);
      clamp(Math.max(1, after));
    })
    .onEnd(() => {
      if (zoom.get() < 1) {
        zoom.set(withSpring(1, SNAP_BACK));
        tx.set(withSpring(0, SNAP_BACK));
        ty.set(withSpring(0, SNAP_BACK));
      }
    });

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.get() }, { translateY: ty.get() }, { scale: zoom.get() }],
  }));

  return (
    <GestureDetector gesture={Gesture.Simultaneous(pan, pinch)}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.center]} collapsable={false}>
        <Animated.View style={[{ width: baseW, height: baseH }, style]}>
          {/* Plain RN Image: a local file, which view-shot captures reliably. */}
          <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
