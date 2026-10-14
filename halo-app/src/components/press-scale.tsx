import { useState } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

type Props = Omit<PressableProps, 'style'> & {
  /** Visual style of the scaling content. */
  style?: StyleProp<ViewStyle>;
  className?: string;
  /** Layout style of the outer touch target (flex, margins). */
  pressableStyle?: StyleProp<ViewStyle>;
};

/**
 * Pressable with Oura-calm press feedback: scales to 0.97 on press-in (120ms ease-out CSS
 * transition, UI thread), commits on press-out.
 */
export function PressScale({
  style,
  className,
  pressableStyle,
  children,
  onPressIn,
  onPressOut,
  ...rest
}: Props) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      {...rest}
      style={pressableStyle}
      onPressIn={(e) => {
        setPressed(true);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        onPressOut?.(e);
      }}>
      <Animated.View
        className={className}
        style={[
          style,
          {
            transform: [{ scale: pressed ? 0.97 : 1 }],
            transitionProperty: 'transform',
            transitionDuration: 120,
            transitionTimingFunction: 'ease-out',
          },
        ]}>
        {children as React.ReactNode}
      </Animated.View>
    </Pressable>
  );
}
