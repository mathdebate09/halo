import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  withTiming,
} from 'react-native-reanimated';

import { MicIcon, StopIcon } from './icons';
import { PressScale } from './press-scale';

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

/**
 * The mic beside a note or a message: a quiet icon at rest; while listening, a filled circle with
 * a stop square, and a soft ring that swells with the voice (UI thread). Hidden where the phone
 * can't recognise speech on the device.
 */
export function MicButton({
  listening,
  level,
  onPress,
  color,
  fill,
  size = 40,
  offset = 6,
}: {
  listening: boolean;
  level: SharedValue<number>;
  onPress: () => void;
  /** Icon colour at rest, and the filled circle's colour while listening. */
  color: string;
  /** The stop square's colour (sits on the filled circle). */
  fill: string;
  size?: number;
  /** Space under the button, to sit level with the send button beside it. */
  offset?: number;
}) {
  const reduced = useReducedMotion();
  const ring = useAnimatedStyle(() => {
    const v = listening ? level.get() : 0;
    return {
      opacity: withTiming(listening ? 0.18 + v * 0.22 : 0, { duration: 120 }),
      transform: [
        { scale: reduced ? 1.15 : withTiming(1 + v * 0.45, { duration: 120, easing: EASE_OUT }) },
      ],
    };
  });
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={listening ? 'Stop listening' : 'Speak'}
      onPress={onPress}
      hitSlop={6}
      pressableStyle={{ marginBottom: offset }}>
      <Animated.View style={[{ width: size, height: size }, styles.center]}>
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { borderRadius: size / 2, backgroundColor: color },
            ring,
          ]}
        />
        <Animated.View
          style={[
            styles.center,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: listening ? color : 'transparent',
              transitionProperty: 'backgroundColor',
              transitionDuration: 200,
            },
          ]}>
          {listening ? <StopIcon size={18} color={fill} /> : <MicIcon size={22} color={color} />}
        </Animated.View>
      </Animated.View>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});
