import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChevronDownIcon } from '@/components/icons';
import { SegmentedToggle } from '@/components/segmented-toggle';
import { shareSnapshot } from '@/share/snapshot';
import { CameraSource } from '@/share/sources/camera-source';
import { HaloGrid } from '@/share/sources/halo-grid';
import { PhotosGrid } from '@/share/sources/photos-grid';
import { useHaloTheme } from '@/theme/theme-provider';

type Source = 'photos' | 'halo' | 'camera';
const SOURCES: { id: Source; label: string }[] = [
  { id: 'photos', label: 'Photos' },
  { id: 'halo', label: 'Halo' },
  { id: 'camera', label: 'Camera' },
];

/** Select background: the device's photos, Halo's own heroes and gradients, or a new shot. */
export default function SelectBackground() {
  const insets = useSafeAreaInsets();
  const { theme } = useHaloTheme();
  const snapshot = shareSnapshot();
  const [source, setSource] = useState<Source>('photos');

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top + 8 }}>
      <View className="flex-row items-center px-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={() => router.back()}
          hitSlop={8}
          className="h-11 w-11 items-center justify-center rounded-full active:bg-glass/10">
          <ChevronDownIcon size={26} color={theme.colors.text} />
        </Pressable>
        <View className="flex-1 items-center">
          <Text className="font-sans-medium text-[20px] text-text">Select background</Text>
          {snapshot ? (
            <Text className="mt-0.5 font-sans text-[15px] text-text/60">
              to share Today · {snapshot.overall}
              {snapshot.provisional ? ', early read' : ''}
            </Text>
          ) : null}
        </View>
        <View className="h-11 w-11" />
      </View>
      <View className="mb-3 mt-5">
        <SegmentedToggle
          options={SOURCES}
          value={source}
          onChange={setSource}
          accessibilityLabel="Background source"
        />
      </View>
      {/* Peers, not a hierarchy: the sources swap without a transition. */}
      {source === 'photos' ? <PhotosGrid /> : null}
      {source === 'halo' ? <HaloGrid /> : null}
      {source === 'camera' ? <CameraSource /> : null}
    </View>
  );
}
