import * as Haptics from 'expo-haptics';
import { memo, useEffect, useRef } from 'react';
import { FlatList, type ListRenderItem, Text, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

export const WHEEL_ITEM_HEIGHT = 48;
const VISIBLE = 5;
const AnimatedFlatList = Animated.FlatList<string>;

type Props = {
  items: string[];
  selectedIndex: number;
  onChange: (index: number) => void;
  accessibilityLabel: string;
};

/**
 * One snap-scrolling wheel column (date of birth). Rows fade and shrink with distance from the
 * centre band; each row change ticks a selection haptic. Scroll and styling stay on the UI thread.
 */
export function WheelPicker({ items, selectedIndex, onChange, accessibilityLabel }: Props) {
  const listRef = useRef<FlatList<string>>(null);
  const offset = useSharedValue(selectedIndex * WHEEL_ITEM_HEIGHT);
  const lastIndex = useRef(selectedIndex);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      offset.set(e.contentOffset.y);
    },
  });

  const tick = () => void Haptics.selectionAsync();
  useAnimatedReaction(
    () => Math.round(offset.get() / WHEEL_ITEM_HEIGHT),
    (current, previous) => {
      if (previous != null && current !== previous) scheduleOnRN(tick);
    },
  );

  const settle = () => {
    const index = Math.max(
      0,
      Math.min(items.length - 1, Math.round(offset.get() / WHEEL_ITEM_HEIGHT)),
    );
    if (index !== lastIndex.current) {
      lastIndex.current = index;
      onChange(index);
    }
  };

  // External changes (e.g. the day clamped when the month gets shorter).
  useEffect(() => {
    if (selectedIndex === lastIndex.current) return;
    lastIndex.current = selectedIndex;
    listRef.current?.scrollToOffset({ offset: selectedIndex * WHEEL_ITEM_HEIGHT, animated: true });
  }, [selectedIndex]);

  const step = (direction: 1 | -1) => {
    const index = Math.max(0, Math.min(items.length - 1, selectedIndex + direction));
    lastIndex.current = index;
    onChange(index);
    listRef.current?.scrollToOffset({ offset: index * WHEEL_ITEM_HEIGHT, animated: true });
  };

  const renderItem: ListRenderItem<string> = ({ item, index }) => (
    <WheelRow label={item} index={index} offset={offset} />
  );

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ text: items[selectedIndex] }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
      // Fixed height, full width: flex-1 here would collapse it inside an auto-height column.
      style={{ height: WHEEL_ITEM_HEIGHT * VISIBLE }}
      className="w-full">
      <AnimatedFlatList
        ref={listRef as never}
        data={items}
        keyExtractor={(item, index) => `${index}:${item}`}
        renderItem={renderItem}
        getItemLayout={(_, index) => ({
          length: WHEEL_ITEM_HEIGHT,
          offset: WHEEL_ITEM_HEIGHT * index,
          index,
        })}
        initialScrollIndex={selectedIndex}
        contentContainerStyle={{ paddingVertical: WHEEL_ITEM_HEIGHT * ((VISIBLE - 1) / 2) }}
        showsVerticalScrollIndicator={false}
        snapToInterval={WHEEL_ITEM_HEIGHT}
        decelerationRate="fast"
        onScroll={onScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={settle}
        onScrollEndDrag={settle}
        windowSize={5}
      />
    </View>
  );
}

const WheelRow = memo(function WheelRow({
  label,
  index,
  offset,
}: {
  label: string;
  index: number;
  offset: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const distance = Math.abs(offset.get() / WHEEL_ITEM_HEIGHT - index);
    return {
      opacity: interpolate(distance, [0, 1, 2.5], [1, 0.45, 0.12], Extrapolation.CLAMP),
      transform: [{ scale: interpolate(distance, [0, 2], [1, 0.88], Extrapolation.CLAMP) }],
    };
  });
  return (
    <Animated.View
      style={[{ height: WHEEL_ITEM_HEIGHT }, style]}
      className="items-center justify-center">
      <Text className="font-sans text-[22px] text-text">{label}</Text>
    </Animated.View>
  );
});
