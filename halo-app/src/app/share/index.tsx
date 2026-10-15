import { FlashList } from '@shopify/flash-list';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { AssetField, MediaType, Query, usePermissions } from 'expo-media-library';
import {
  type Album,
  getAlbumsAsync,
  getAssetsAsync,
  MediaType as LegacyMediaType,
  SortBy,
} from 'expo-media-library/legacy';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CameraIcon, ChevronDownIcon } from '@/components/icons';
import { PressScale } from '@/components/press-scale';
import { SegmentedToggle } from '@/components/segmented-toggle';
import { showToast } from '@/components/toast';
import { useHaloTheme } from '@/theme/theme-provider';
import { type Tier, themeIds, themes, tierGradients } from '@/theme/themes';
import { preparePhoto, prepareHero } from '@/share/photo';
import { shareSnapshot } from '@/share/snapshot';

type Source = 'photos' | 'halo' | 'camera';
const SOURCES: { id: Source; label: string }[] = [
  { id: 'photos', label: 'Photos' },
  { id: 'halo', label: 'Halo' },
  { id: 'camera', label: 'Camera' },
];

/** Opens the composer with a background that is already a local, upright JPEG. */
function compose(photo: { uri: string; width: number; height: number }) {
  router.push({
    pathname: '/share/compose',
    params: { uri: photo.uri, w: String(photo.width), h: String(photo.height) },
  });
}

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

type Photo = { id: string; uri: string; width: number; height: number };
type Collection = { id: 'recents' | 'favorites' | string; title: string; album?: Album };

const PAGE = 60;

function PhotosGrid() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { theme } = useHaloTheme();
  const [permission, requestPermission] = usePermissions({ granularPermissions: ['photo'] });
  const [collections, setCollections] = useState<Collection[]>([
    { id: 'recents', title: 'Recents' },
    { id: 'favorites', title: 'Favorites' },
  ]);
  const [active, setActive] = useState('recents');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const cursor = useRef<{ end?: string; more: boolean; loading: boolean }>({
    more: true,
    loading: false,
  });
  const granted = permission?.granted ?? false;

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) requestPermission();
  }, [permission, requestPermission]);

  // The biggest albums become chips after Recents and Favorites.
  useEffect(() => {
    if (!granted) return;
    getAlbumsAsync()
      .then((albums) => {
        const top = albums
          .filter((a) => a.assetCount > 0)
          .sort((a, b) => b.assetCount - a.assetCount)
          .slice(0, 5)
          .map((a) => ({ id: a.id, title: a.title, album: a }));
        setCollections((c) => [...c.slice(0, 2), ...top]);
      })
      .catch(() => {});
  }, [granted]);

  const load = useCallback(
    async (reset: boolean) => {
      const c = cursor.current;
      if (c.loading || (!reset && !c.more)) return;
      c.loading = true;
      try {
        if (active === 'favorites') {
          // Favourites only exist in the new query API; it returns ids, so resolve each one.
          const assets = await new Query()
            .eq(AssetField.IS_FAVORITE, true)
            .eq(AssetField.MEDIA_TYPE, MediaType.IMAGE)
            .orderBy({ key: AssetField.CREATION_TIME, ascending: false })
            .limit(PAGE)
            .exe();
          const resolved = await Promise.all(
            assets.map(async (a) => ({
              id: a.id,
              uri: await a.getUri(),
              width: await a.getWidth(),
              height: await a.getHeight(),
            })),
          );
          setPhotos(resolved);
          c.more = false;
        } else {
          const album = collections.find((x) => x.id === active)?.album;
          const page = await getAssetsAsync({
            first: PAGE,
            after: reset ? undefined : c.end,
            album,
            mediaType: LegacyMediaType.photo,
            sortBy: [[SortBy.creationTime, false]],
          });
          const next = page.assets.map((a) => ({
            id: a.id,
            uri: a.uri,
            width: a.width,
            height: a.height,
          }));
          setPhotos((p) => (reset ? next : [...p, ...next]));
          c.end = page.endCursor;
          c.more = page.hasNextPage;
        }
      } catch {
        if (reset) setPhotos([]);
      } finally {
        c.loading = false;
      }
    },
    [active, collections],
  );

  useEffect(() => {
    if (!granted) return;
    cursor.current = { more: true, loading: false };
    load(true);
    // Reload when the chip changes, not when the album list fills in.
  }, [granted, active]);

  const pick = async (photo: Photo) => {
    if (busy) return;
    setBusy(photo.id);
    try {
      compose(await preparePhoto(photo.uri, photo.width, photo.height));
    } catch {
      showToast("Couldn't open that photo");
    } finally {
      setBusy(null);
    }
  };

  if (permission && !granted) {
    return (
      <View className="flex-1 items-center px-8 pt-16">
        <Text className="text-center font-sans text-[16px] text-text/70">
          Allow access to your photos to use one as the background.
        </Text>
        <PressScale
          accessibilityRole="button"
          onPress={() => requestPermission()}
          className="mt-6 rounded-pill bg-glass/10 px-8 py-3.5">
          <Text className="font-sans-medium text-[16px] text-text">Allow photos</Text>
        </PressScale>
      </View>
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
            onPress={() => setActive(c.id)}
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
        onEndReached={() => load(false)}
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
            {busy === item.id ? (
              <View className="absolute inset-0 items-center justify-center bg-black/40">
                <ActivityIndicator color={theme.colors.text} />
              </View>
            ) : null}
          </Pressable>
        )}
      />
    </View>
  );
}

/** Today's hero first, then the other heroes, then the three tier gradients. */
function HaloGrid() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { target, theme } = useHaloTheme();
  const [busy, setBusy] = useState<string | null>(null);
  const heroes = [target.id, ...themeIds.filter((id) => id !== target.id)];
  const tiers: Tier[] = ['high', 'mid', 'low'];
  const tileW = (width - 32 - 16) / 3;
  const tileH = tileW * (16 / 9);

  const pickHero = async (id: string, url: string) => {
    if (busy) return;
    setBusy(id);
    try {
      compose(await prepareHero(url));
    } catch {
      showToast('That one needs a connection the first time');
    } finally {
      setBusy(null);
    }
  };

  return (
    <ScrollView
      contentContainerClassName="flex-row flex-wrap gap-2 px-4 pt-2"
      contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}>
      {heroes.map((id) => (
        <PressScale
          key={id}
          accessibilityRole="imagebutton"
          accessibilityLabel={id === target.id ? "Today's hero" : 'Halo hero'}
          onPress={() => pickHero(id, themes[id].image)}
          className="overflow-hidden rounded-[14px]"
          style={{ width: tileW, height: tileH }}>
          <Image
            source={{ uri: themes[id].image }}
            placeholder={{ blurhash: themes[id].blurhash }}
            cachePolicy="memory-disk"
            style={{ flex: 1 }}
            contentFit="cover"
          />
          {busy === id ? (
            <View className="absolute inset-0 items-center justify-center bg-black/40">
              <ActivityIndicator color={theme.colors.text} />
            </View>
          ) : null}
        </PressScale>
      ))}
      {tiers.map((tier) => (
        <PressScale
          key={tier}
          accessibilityRole="imagebutton"
          accessibilityLabel={`${tier} gradient`}
          onPress={() => router.push({ pathname: '/share/compose', params: { gradient: tier } })}
          className="overflow-hidden rounded-[14px]"
          style={{ width: tileW, height: tileH }}>
          <LinearGradient colors={tierGradients[tier]} style={{ flex: 1 }} />
        </PressScale>
      ))}
    </ScrollView>
  );
}

function CameraSource() {
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
      <View className="flex-1 items-center px-8 pt-16">
        <Text className="text-center font-sans text-[16px] text-text/70">
          Allow the camera to take a background.
        </Text>
        <PressScale
          accessibilityRole="button"
          onPress={() => requestPermission()}
          className="mt-6 rounded-pill bg-glass/10 px-8 py-3.5">
          <Text className="font-sans-medium text-[16px] text-text">Allow camera</Text>
        </PressScale>
      </View>
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
