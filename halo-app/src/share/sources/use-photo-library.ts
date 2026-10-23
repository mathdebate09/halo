import { AssetField, MediaType, Query, usePermissions } from 'expo-media-library';
import {
  type Album,
  getAlbumsAsync,
  getAssetsAsync,
  MediaType as LegacyMediaType,
  SortBy,
} from 'expo-media-library/legacy';
import { useCallback, useEffect, useRef, useState } from 'react';

export type Photo = { id: string; uri: string; width: number; height: number };
export type Collection = { id: 'recents' | 'favorites' | string; title: string; album?: Album };

const PAGE = 60;

/**
 * The device's photos for the background picker: the permission, the collections (Recents,
 * Favorites, then the biggest albums), and the chosen collection's photos a page at a time.
 */
export function usePhotoLibrary() {
  const [permission, requestPermission] = usePermissions({ granularPermissions: ['photo'] });
  const [collections, setCollections] = useState<Collection[]>([
    { id: 'recents', title: 'Recents' },
    { id: 'favorites', title: 'Favorites' },
  ]);
  const [active, setActive] = useState('recents');
  const [photos, setPhotos] = useState<Photo[]>([]);
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

  return {
    permission,
    requestPermission,
    granted,
    collections,
    active,
    setActive,
    photos,
    loadMore: () => load(false),
  };
}
