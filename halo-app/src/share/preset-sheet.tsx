// The sticker drawer: Today / Totals tabs over a two-column grid of live previews. It rises on its
// own when the composer opens; tap a preset to drop it on the card. Drag the header down, or tap
// the card above, to put it away.

import { useEffect, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { PressScale } from '@/components/press-scale';

import { type Preset, type PresetTab, PRESETS } from './presets';
import type { ShareSnapshot } from './snapshot';

const EASE_SHEET = Easing.bezier(0.32, 0.72, 0, 1);
const OPEN_MS = 420;
const GAP = 12;
const PAD = 16;

type Props = {
  open: boolean;
  onClose: () => void;
  onPick: (preset: Preset) => void;
  snapshot: ShareSnapshot;
  width: number;
  height: number;
};

const TABS: { id: PresetTab; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'totals', label: 'Totals' },
];

export function PresetSheet({ open, onClose, onPick, snapshot, width, height }: Props) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const sheetH = Math.round(height * 0.62);
  /** Fully below the screen edge, nav bar included. */
  const hidden = sheetH + insets.bottom + 24;
  const [tab, setTab] = useState<PresetTab>('today');
  const y = useSharedValue(hidden);

  useEffect(() => {
    const to = open ? 0 : hidden;
    y.set(reduced ? to : withTiming(to, { duration: OPEN_MS, easing: EASE_SHEET }));
  }, [open, hidden, reduced, y]);

  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [open, onClose]);

  // Dragging the header follows the finger (resisting upward); a flick or a third of the way closes.
  const drag = Gesture.Pan()
    .onChange((e) => {
      const next = y.get() + e.changeY;
      y.set(next < 0 ? next * 0.3 : next);
    })
    .onEnd((e) => {
      const close = e.velocityY > 800 || y.get() > sheetH / 3;
      y.set(
        withSpring(close ? hidden : 0, {
          duration: 300,
          dampingRatio: 0.8,
          velocity: e.velocityY,
          overshootClamping: close,
        }),
      );
      if (close) scheduleOnRN(onClose);
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(y.get(), [0, hidden], [1, 0]),
  }));

  const tileW = (width - PAD * 2 - GAP) / 2;
  const presets = PRESETS.filter((p) => p.tab === tab);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? 'box-none' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="Close stickers"
        />
      </Animated.View>
      <Animated.View
        className="absolute inset-x-0 bottom-0 rounded-t-card bg-surface"
        style={[{ height: sheetH + insets.bottom }, sheetStyle]}
        accessibilityViewIsModal>
        <GestureDetector gesture={drag}>
          <View collapsable={false}>
            <View className="items-center pb-3 pt-3">
              <View className="h-1 w-10 rounded-pill bg-text/30" />
            </View>
            <View className="mx-4 flex-row" accessibilityRole="tablist">
              {TABS.map((t) => (
                <Pressable
                  key={t.id}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: tab === t.id }}
                  onPress={() => setTab(t.id)}
                  className="flex-1 items-center pb-3 pt-1">
                  <Text
                    className={`font-sans-medium text-[17px] ${tab === t.id ? 'text-text' : 'text-text/50'}`}>
                    {t.label}
                  </Text>
                </Pressable>
              ))}
              <View className="absolute inset-x-0 bottom-0 h-px bg-text/15" />
              {/* Out of flow and childless, so sliding it costs no layout. */}
              <Animated.View
                className="absolute bottom-0 h-0.5 bg-text"
                style={{
                  width: (width - PAD * 2) / 2,
                  transform: [{ translateX: tab === 'today' ? 0 : (width - PAD * 2) / 2 }],
                  transitionProperty: 'transform',
                  transitionDuration: 200,
                  transitionTimingFunction: 'ease-out',
                }}
              />
            </View>
          </View>
        </GestureDetector>
        <ScrollView
          contentContainerStyle={{
            padding: PAD,
            paddingBottom: PAD + insets.bottom,
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: GAP,
          }}
          showsVerticalScrollIndicator={false}>
          {presets.length === 0 ? (
            <Text className="w-full py-10 text-center font-sans text-[15px] text-text/60">
              Coming soon
            </Text>
          ) : (
            presets.map((preset) => (
              <PressScale
                key={preset.id}
                accessibilityRole="button"
                accessibilityLabel={`Add ${preset.label}`}
                onPress={() => onPick(preset)}
                className="items-center justify-center overflow-hidden rounded-[20px] bg-glass/5"
                style={{ width: tileW, height: tileW }}>
                <Preview preset={preset} snapshot={snapshot} size={tileW - 24} />
              </PressScale>
            ))
          )}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

/** The sticker at full size, shrunk to fit its tile once measured. */
function Preview({
  preset,
  snapshot,
  size,
}: {
  preset: Preset;
  snapshot: ShareSnapshot;
  size: number;
}) {
  const [scale, setScale] = useState<number | null>(null);
  // A wide, out-of-flow row so the sticker lays out at its natural width (no wrapping).
  return (
    <View
      pointerEvents="none"
      style={[
        styles.unbounded,
        { opacity: scale == null ? 0 : 1, transform: [{ scale: scale ?? 1 }] },
      ]}>
      <View
        onLayout={(e) => {
          const { width: w, height: h } = e.nativeEvent.layout;
          setScale(Math.min(1, size / w, size / h));
        }}>
        {preset.render(snapshot, 'light')}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.25)' },
  unbounded: { position: 'absolute', width: 1000, alignItems: 'center' },
});
