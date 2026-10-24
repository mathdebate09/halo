import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showToast } from '@/components/toast';
import { preparePhoto } from '@/share/photo';
import { AllowAccess } from '@/share/sources/allow-access';
import { BusyOverlay } from '@/share/sources/busy-overlay';
import { openComposer } from '@/share/sources/open-composer';
import { type Photo, usePhotoLibrary } from '@/share/sources/use-photo-library';

/** The device's photos: collection chips over a three-column grid. */
export function PhotosGrid() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const library = usePhotoLibrary();
  const { collections, active, photos } = library;
  const [busy, setBusy] = useState<string | null>(null);

  const pick = async (photo: Photo) => {
    if (busy) return;
    setBusy(photo.id);
    try {
      openComposer(await preparePhoto(photo.uri, photo.width, photo.height));
    } catch {
      showToast("Couldn't open that photo");
    } finally {
      setBusy(null);
    }
  };

  if (library.permission && !library.granted) {
    return (
      <AllowAccess
        line="Allow access to your photos to use one as the background."
        button="Allow photos"
        onAllow={() => library.requestPermission()}
      />
    );
  }

  const tile = width / 3;
  return (
    <View className="flex-1">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="mb-2 flex-grow-0"
        contentContainerClassName="gap-5 px-4">
        {collections.map((c) => (
          <Pressable
            key={c.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: active === c.id }}
            onPress={() => library.setActive(c.id)}
            className="py-2">
            <Text
              className={`font-sans-medium text-[16px] ${active === c.id ? 'text-text' : 'text-text/50'}`}>
              {c.title}
            </Text>
            {active === c.id ? <View className="mt-1.5 h-0.5 rounded-pill bg-text" /> : null}
          </Pressable>
        ))}
      </ScrollView>
      <FlashList
        data={photos}
        numColumns={3}
        keyExtractor={(p) => p.id}
        onEndReached={library.loadMore}
        onEndReachedThreshold={0.6}
        contentContainerStyle={{ paddingBottom: insets.bottom }}
        ListEmptyComponent={
          <Text className="pt-16 text-center font-sans text-[15px] text-text/60">
            No photos here
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="imagebutton"
            accessibilityLabel="Use this photo"
            onPress={() => pick(item)}
            style={{ width: tile, height: tile * 1.33, padding: 1 }}>
            <Image
              source={{ uri: item.uri }}
              recyclingKey={item.id}
              style={{ flex: 1 }}
              contentFit="cover"
            />
            {busy === item.id ? <BusyOverlay /> : null}
          </Pressable>
        )}
      />
    </View>
  );
}
