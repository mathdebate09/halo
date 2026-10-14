import { type ReactNode, useEffect } from 'react';
import { BackHandler, KeyboardAvoidingView, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const EASE_SHEET = Easing.bezier(0.32, 0.72, 0, 1);

type Props = {
  visible: boolean;
  onClose: () => void;
  accessibilityLabel: string;
  children: ReactNode;
};

/**
 * A bottom sheet inside the current screen: tinted backdrop, a glass-edged panel that rises from
 * the bottom edge and leaves the same way. Back and a tap outside close it.
 */
export function Sheet({ visible, onClose, accessibilityLabel, children }: Props) {
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  if (!visible) return null;
  return (
    <KeyboardAvoidingView behavior="padding" style={StyleSheet.absoluteFill}>
      <Animated.View
        entering={FadeIn.duration(300)}
        exiting={FadeOut.duration(250)}
        style={StyleSheet.absoluteFill}>
        <Pressable accessibilityLabel="Close" onPress={onClose} className="flex-1 bg-veil/60" />
      </Animated.View>
      <View className="flex-1" pointerEvents="box-none" />
      <Animated.View
        accessibilityViewIsModal
        accessibilityLabel={accessibilityLabel}
        entering={SlideInDown.duration(400).easing(EASE_SHEET)}
        exiting={SlideOutDown.duration(300).easing(EASE_SHEET)}
        className="rounded-t-card border-x border-t border-hairline/10 bg-surface px-6 pt-3">
        <View className="mb-4 h-1 w-10 self-center rounded-pill bg-glass/20" />
        {children}
        {/* A plain View: NativeWind drops `style` on an Animated.View that also has className. */}
        <View style={{ height: insets.bottom + 16 }} />
      </Animated.View>
    </KeyboardAvoidingView>
  );
}
