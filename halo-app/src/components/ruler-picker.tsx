import * as Haptics from 'expo-haptics';
import { memo, useEffect, useRef, useState } from 'react';
import { FlatList, type ListRenderItem, Text, View } from 'react-native';
import Animated, {
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useHaloTheme } from '@/theme/theme-provider';

/** A ruler in display units: e.g. kg 0.1/10 per major, cm 1/10, inches 1/12. */
export type RulerScale = {
  min: number;
  max: number;
  step: number;
  ticksPerMajor: number;
  /** Label under a major tick. */
  formatMajor: (value: number) => string;
};

type Props = {
  scale: RulerScale;
  /** Current value in display units (controlled). */
  value: number;
  /** Committed value: when scrolling settles (parent state updates here, never mid-scroll). */
  onChange: (value: number) => void;
  /**
   * Live value while scrolling, throttled. Must not re-render the ruler's parent: re-rendering
   * the list mid-gesture cuts the native fling short. Feed a ref-driven readout instead.
   */
  onLive?: (value: number) => void;
  orientation: 'horizontal' | 'vertical';
  accessibilityLabel: string;
  /** Spoken value, e.g. "65.4 kilograms". */
  accessibilityValueText: (value: number) => string;
};

const SPACING = 10; // px between minor ticks
const LIVE_EVERY_MS = 32; // throttle for the live readout while dragging/flinging // throttle for JS updates while dragging/flinging
const HAPTIC_EVERY_MS = 70;
const decimalsOf = (step: number) => (step < 1 ? (String(step).split('.')[1]?.length ?? 1) : 0);

const AnimatedFlatList = Animated.FlatList<number>;

/**
 * Snap-to-tick ruler (SPEC "Ruler inputs"). Each list item is one labelled major segment, so
 * only the visible ticks render. Fling and snap are the native scroll view's; the position is
 * read on the UI thread and handed to JS throttled. A selection haptic marks each major tick.
 */
export const RulerPicker = memo(function RulerPicker({
  scale,
  value,
  onChange,
  onLive,
  orientation,
  accessibilityLabel,
  accessibilityValueText,
}: Props) {
  const { theme } = useHaloTheme();
  const horizontal = orientation === 'horizontal';
  const { min, max, step, ticksPerMajor } = scale;
  const decimals = decimalsOf(step);
  const segmentLength = ticksPerMajor * SPACING;
  const segments = Math.floor((max - min) / step / ticksPerMajor) + 1;
  const [data] = useState(() => Array.from({ length: segments }, (_, i) => i));
  const [size, setSize] = useState(0);

  const listRef = useRef<FlatList<number>>(null);
  const offset = useSharedValue(0);
  const lastEmit = useSharedValue(0);
  const lastHaptic = useSharedValue(0);
  const lastEmitted = useRef(value);
  const positioned = useRef(false);

  const toOffset = (v: number) => ((v - min) / step) * SPACING;

  const emit = (v: number) => {
    lastEmitted.current = v;
    onChange(v);
  };
  const tick = () => void Haptics.selectionAsync();
  const live = (v: number) => onLive?.(v);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      offset.set(horizontal ? e.contentOffset.x : e.contentOffset.y);
    },
  });

  // Offset → value on the UI thread; the live readout hears about it at most every 32ms and the
  // parent only gets the settled value (onMomentumScrollEnd / onScrollEndDrag).
  useAnimatedReaction(
    () => {
      const index = Math.round(offset.get() / SPACING);
      const raw = min + index * step;
      return Math.min(max, Math.max(min, Math.round(raw * 10 ** decimals) / 10 ** decimals));
    },
    (current, previous) => {
      if (previous == null || current === previous) return;
      const now = Date.now();
      if (now - lastEmit.get() >= LIVE_EVERY_MS) {
        lastEmit.set(now);
        scheduleOnRN(live, current);
      }
      const major = Math.floor((current - min) / (step * ticksPerMajor) + 1e-6);
      const prevMajor = Math.floor((previous - min) / (step * ticksPerMajor) + 1e-6);
      if (major !== prevMajor && now - lastHaptic.get() >= HAPTIC_EVERY_MS) {
        lastHaptic.set(now);
        scheduleOnRN(tick);
      }
    },
  );

  const settle = () => {
    const index = Math.round(offset.get() / SPACING);
    const v = Math.min(max, Math.max(min, Number((min + index * step).toFixed(decimals))));
    if (v !== lastEmitted.current) emit(v);
  };

  // Typing in the number field moves the ruler (skip values this ruler just emitted).
  useEffect(() => {
    if (!size || Math.abs(value - lastEmitted.current) < step / 2) return;
    lastEmitted.current = value;
    listRef.current?.scrollToOffset({ offset: toOffset(value), animated: true });
  });

  const nudge = (direction: 1 | -1) => {
    const v = Math.min(max, Math.max(min, Number((value + direction * step).toFixed(decimals))));
    emit(v);
    listRef.current?.scrollToOffset({ offset: toOffset(v), animated: true });
  };

  const renderItem: ListRenderItem<number> = ({ item }) => (
    <Segment
      index={item}
      scale={scale}
      horizontal={horizontal}
      length={segmentLength}
      crossSize={horizontal ? 96 : 120}
      color={theme.colors.text}
    />
  );

  const pad = size / 2;

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ text: accessibilityValueText(value) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => nudge(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
      onLayout={(e) => {
        const next = horizontal ? e.nativeEvent.layout.width : e.nativeEvent.layout.height;
        if (next && next !== size) setSize(next);
      }}
      className={horizontal ? 'h-[110px] w-full' : 'h-full w-[120px]'}>
      {size > 0 ? (
        <AnimatedFlatList
          ref={listRef as never}
          data={data}
          keyExtractor={String}
          renderItem={renderItem}
          horizontal={horizontal}
          // Values rise upward on the vertical (height) ruler.
          inverted={!horizontal}
          getItemLayout={(_, index) => ({
            length: segmentLength,
            offset: segmentLength * index,
            index,
          })}
          contentContainerStyle={horizontal ? { paddingHorizontal: pad } : { paddingVertical: pad }}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          snapToInterval={SPACING}
          decelerationRate="normal"
          onScroll={onScroll}
          scrollEventThrottle={16}
          // Scroll to the starting value once the content is measured (earlier calls get clamped).
          onContentSizeChange={() => {
            if (positioned.current) return;
            positioned.current = true;
            listRef.current?.scrollToOffset({ offset: toOffset(value), animated: false });
          }}
          onMomentumScrollEnd={settle}
          onScrollEndDrag={settle}
          initialNumToRender={Math.ceil(size / segmentLength) + 4}
          windowSize={7}
          removeClippedSubviews={false}
        />
      ) : null}
      {/* Fixed centre marker. */}
      <View
        pointerEvents="none"
        style={
          horizontal
            ? {
                left: size / 2 - 1,
                top: 0,
                width: 2,
                height: 52,
                backgroundColor: theme.colors.accent,
              }
            : {
                top: size / 2 - 1,
                left: 0,
                height: 2,
                width: 64,
                backgroundColor: theme.colors.accent,
              }
        }
        className="absolute rounded-pill"
      />
    </View>
  );
});

type SegmentProps = {
  index: number;
  scale: RulerScale;
  horizontal: boolean;
  length: number;
  crossSize: number;
  color: string;
};

/**
 * One major segment: the labelled major tick plus its minor ticks (half-way tick a bit longer).
 * Vertical rulers are inverted lists whose cells stack upward, so ticks are measured up from
 * the cell's bottom to keep values rising with the cells.
 */
const Segment = memo(function Segment({
  index,
  scale,
  horizontal,
  length,
  crossSize,
  color,
}: SegmentProps) {
  const { min, max, step, ticksPerMajor, formatMajor } = scale;
  const base = min + index * ticksPerMajor * step;
  const ticks = [];
  for (let k = 0; k < ticksPerMajor; k++) {
    const v = base + k * step;
    if (v > max + step / 2) break;
    const major = k === 0;
    const half = ticksPerMajor % 2 === 0 && k === ticksPerMajor / 2;
    const len = major ? 40 : half ? 26 : 16;
    const pos = k * SPACING;
    ticks.push(
      <View
        key={k}
        style={
          horizontal
            ? { position: 'absolute', left: pos, top: 6, width: major ? 2 : 1, height: len }
            : { position: 'absolute', bottom: pos, left: 6, height: major ? 2 : 1, width: len }
        }
        className={major ? 'bg-text' : 'bg-text/40'}
      />,
    );
  }
  return (
    <View
      style={
        horizontal ? { width: length, height: crossSize } : { height: length, width: crossSize }
      }>
      {ticks}
      {base <= max ? (
        <Text
          style={
            horizontal
              ? { position: 'absolute', left: -30, width: 60, top: 54, color }
              : { position: 'absolute', bottom: -10, height: 20, left: 54, color }
          }
          className="text-center font-sans text-[14px]">
          {formatMajor(base)}
        </Text>
      ) : null}
    </View>
  );
});
