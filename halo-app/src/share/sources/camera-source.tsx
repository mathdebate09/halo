import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CameraIcon } from '@/components/icons';
import { PressScale } from '@/components/press-scale';
import { showToast } from '@/components/toast';
import { preparePhoto } from '@/share/photo';
import { AllowAccess, compose } from '@/share/sources/parts';
import { useHaloTheme } from '@/theme/theme-provider';

/** A new shot as the background, framed 9:16 like the story it becomes. */
export function CameraSource() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { theme } = useHaloTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(true);
  const camera = useRef<CameraView>(null);

  // The camera only runs while this screen is in view (it pauses under the composer).
  useFocusEffect(
    useCallback(() => {
      setActive(true);
      return () => setActive(false);
    }, []),
  );

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) requestPermission();
  }, [permission, requestPermission]);

  const shoot = async () => {
    if (!camera.current || busy || !ready) return;
    setBusy(true);
    try {
      const shot = await camera.current.takePictureAsync({ quality: 0.9 });
      compose(await preparePhoto(shot.uri, shot.width, shot.height));
    } catch {
      showToast("Couldn't take the photo");
    } finally {
      setBusy(false);
    }
  };

  if (permission && !permission.granted) {
    return (
      <AllowAccess
        line="Allow the camera to take a background."
        button="Allow camera"
        onAllow={() => requestPermission()}
      />
    );
  }

  const frameW = Math.min(width - 32, (height * 0.6 * 9) / 16);
  return (
    <View className="flex-1 items-center" style={{ paddingBottom: insets.bottom + 12 }}>
      <View
        className="overflow-hidden rounded-card bg-black"
        style={{ width: frameW, height: (frameW * 16) / 9 }}>
        {active ? (
          <CameraView
            ref={camera}
            style={{ flex: 1 }}
            facing={facing}
            animateShutter={false}
            onCameraReady={() => setReady(true)}
          />
        ) : null}
      </View>
      <View className="mt-5 w-full flex-row items-center justify-center">
        <PressScale
          accessibilityRole="button"
          accessibilityLabel="Take photo"
          onPress={shoot}
          className="h-[72px] w-[72px] items-center justify-center rounded-full border-[3px] border-text">
          {busy ? (
            <ActivityIndicator color={theme.colors.text} />
          ) : (
            <View className="h-[58px] w-[58px] rounded-full bg-text" />
          )}
        </PressScale>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Switch camera"
          onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
          hitSlop={8}
          className="absolute right-10 h-12 w-12 items-center justify-center rounded-full bg-glass/10">
          <CameraIcon size={22} color={theme.colors.text} />
        </Pressable>
      </View>
      {!ready && active ? (
        <Animated.View entering={FadeIn} className="absolute inset-x-0 top-40 items-center">
          <ActivityIndicator color={theme.colors.text} />
        </Animated.View>
      ) : null}
    </View>
  );
}
