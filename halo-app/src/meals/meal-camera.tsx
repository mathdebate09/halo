import { BlurTargetView, BlurView } from 'expo-blur';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { CloseIcon, GalleryIcon } from '@/components/icons';
import { PressScale } from '@/components/press-scale';
import { useHaloTheme } from '@/theme/theme-provider';
import { tierGradients } from '@/theme/themes';

import { compressPhoto } from './capture';

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const LIFT_MS = 450;

type Props = {
  photo: string | null;
  onPhoto: (uri: string | null) => void;
};

/**
 * The Meal Logger card: a live camera preview under a blur, mounted only while the logger is open
 * and permission is granted. Tapping lifts the blur into a clear viewfinder with a shutter; the
 * shot then freezes in the card. Without the camera the theme gradient stays and opens the gallery.
 */
export function MealCamera({ photo, onPhoto }: Props) {
  const { theme } = useHaloTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [lifted, setLifted] = useState(false);
  const [busy, setBusy] = useState(false);
  const camera = useRef<CameraView>(null);
  const blurTarget = useRef<View>(null);
  const cameraOpacity = useSharedValue(0);
  const blurOpacity = useSharedValue(1);

  const granted = permission?.granted ?? false;
  const cameraStyle = useAnimatedStyle(() => ({ opacity: cameraOpacity.get() }));
  const blurStyle = useAnimatedStyle(() => ({ opacity: blurOpacity.get() }));
  // Capture feedback stays inside the card (expo-camera's own shutter flashes the whole window).
  const dip = useSharedValue(0);
  const dipStyle = useAnimatedStyle(() => ({ opacity: dip.get() }));

  const lift = async () => {
    if (!granted) {
      if (permission?.canAskAgain) {
        const result = await requestPermission();
        if (result.granted) return;
      }
      pickFromGallery();
      return;
    }
    // Crossfade a static blur away rather than animating its intensity (cheap on Android).
    blurOpacity.set(withTiming(0, { duration: LIFT_MS, easing: EASE_OUT }));
    setLifted(true);
  };

  const settle = async (uri: string, width: number, height: number) => {
    setBusy(true);
    try {
      onPhoto(await compressPhoto(uri, width, height));
    } finally {
      setBusy(false);
    }
  };

  const shoot = async () => {
    if (busy || !camera.current) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    dip.set(
      withSequence(
        withTiming(0.5, { duration: 120, easing: EASE_OUT }),
        withTiming(0, { duration: 350, easing: EASE_OUT }),
      ),
    );
    const shot = await camera.current.takePictureAsync({ quality: 0.8 });
    if (shot) await settle(shot.uri, shot.width, shot.height);
  };

  const pickFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] });
    const asset = result.canceled ? null : result.assets[0];
    if (asset) await settle(asset.uri, asset.width, asset.height);
  };

  const retake = () => {
    onPhoto(null);
    cameraOpacity.set(0);
  };

  const [top, mid, bottom] = tierGradients[theme.tier];

  return (
    <View className="flex-1 overflow-hidden rounded-[44px] border border-hairline/10">
      <LinearGradient colors={[top, mid, bottom]} style={StyleSheet.absoluteFill} />

      {photo ? (
        <Animated.View entering={FadeIn.duration(400)} style={StyleSheet.absoluteFill}>
          <Image source={{ uri: photo }} contentFit="cover" style={StyleSheet.absoluteFill} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Remove photo"
            onPress={retake}
            hitSlop={8}
            className="absolute right-4 top-4 h-10 w-10 items-center justify-center rounded-full bg-veil/50">
            <CloseIcon size={20} color={theme.colors.text} />
          </Pressable>
        </Animated.View>
      ) : (
        <>
          {granted ? (
            <Animated.View style={[StyleSheet.absoluteFill, cameraStyle]}>
              <BlurTargetView ref={blurTarget} style={StyleSheet.absoluteFill}>
                <CameraView
                  ref={camera}
                  facing="back"
                  animateShutter={false}
                  style={StyleSheet.absoluteFill}
                  onCameraReady={() =>
                    cameraOpacity.set(withTiming(1, { duration: 500, easing: EASE_OUT }))
                  }
                />
              </BlurTargetView>
              <Animated.View
                pointerEvents="none"
                style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.veil }, dipStyle]}
              />
            </Animated.View>
          ) : null}

          <Animated.View
            style={[StyleSheet.absoluteFill, blurStyle]}
            pointerEvents={lifted ? 'none' : 'auto'}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={granted ? 'Open the camera' : 'Choose a photo'}
              onPress={lift}
              style={StyleSheet.absoluteFill}>
              {granted ? (
                <BlurView
                  blurTarget={blurTarget}
                  blurMethod="dimezisBlurViewSdk31Plus"
                  intensity={70}
                  tint="dark"
                  style={StyleSheet.absoluteFill}
                />
              ) : null}
              <View className="flex-1 items-center justify-center bg-veil/60">
                <Text className="font-serif text-[40px] leading-[46px] text-text">Meal Logger</Text>
              </View>
            </Pressable>
          </Animated.View>

          {lifted ? (
            <Animated.View
              entering={FadeIn.duration(LIFT_MS)}
              exiting={FadeOut.duration(200)}
              pointerEvents="box-none"
              className="absolute inset-x-0 bottom-6 flex-row items-center justify-center">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Choose from gallery"
                onPress={pickFromGallery}
                hitSlop={8}
                className="absolute left-8 h-11 w-11 items-center justify-center rounded-full bg-veil/50">
                <GalleryIcon size={22} color={theme.colors.text} />
              </Pressable>
              <PressScale
                accessibilityRole="button"
                accessibilityLabel="Take photo"
                disabled={busy}
                onPress={shoot}
                className="h-[72px] w-[72px] items-center justify-center rounded-full border-[3px] border-text/90">
                <View className={`h-14 w-14 rounded-full bg-text ${busy ? 'opacity-40' : ''}`} />
              </PressScale>
            </Animated.View>
          ) : null}
        </>
      )}
    </View>
  );
}
