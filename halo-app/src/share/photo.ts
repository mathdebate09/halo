// Every background becomes a local JPEG before the composer opens: EXIF rotation baked in (so
// portrait shots aren't sideways), at most 2160 px on the long edge (bounded memory, fast capture),
// and readable offline by the plain RN Image the export captures.

import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

const MAX_EDGE = 2160;

export type Background =
  | { kind: 'photo'; uri: string; width: number; height: number }
  | { kind: 'gradient'; tier: 'high' | 'mid' | 'low' };

export async function preparePhoto(uri: string, width: number, height: number) {
  let context = ImageManipulator.manipulate(uri);
  if (Math.max(width, height) > MAX_EDGE) {
    context = context.resize(width >= height ? { width: MAX_EDGE } : { height: MAX_EDGE });
  }
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ compress: 0.9, format: SaveFormat.JPEG });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}

/** A hero from expo-image's disk cache (fetched first if it isn't there yet). */
export async function prepareHero(url: string) {
  let path = await Image.getCachePathAsync(url);
  if (!path) {
    await Image.prefetch(url, 'disk');
    path = await Image.getCachePathAsync(url);
  }
  if (!path) throw new Error('hero not cached');
  // The heroes are 1170 × 2532; the manipulator reads the real size anyway.
  return preparePhoto(path.startsWith('file://') ? path : `file://${path}`, 1170, 2532);
}
