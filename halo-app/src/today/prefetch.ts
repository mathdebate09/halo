import { Image } from 'expo-image';

import { type ThemeId, themeIds, themes } from '@/theme/themes';

let done = false;

/**
 * Disk-caches every other hero once per session, so a tier change or a new day crossfades to an
 * image that is already local. Called after the entrance settles, never during first paint.
 */
export function prefetchHeroes(current: ThemeId) {
  if (done) return;
  done = true;
  const urls = themeIds.filter((id) => id !== current).map((id) => themes[id].image);
  Image.prefetch(urls, 'disk').catch(() => {
    done = false;
  });
}
