import { router } from 'expo-router';

/** Opens the composer with a background that is already a local, upright JPEG. */
export function openComposer(photo: { uri: string; width: number; height: number }) {
  router.push({
    pathname: '/share/compose',
    params: { uri: photo.uri, w: String(photo.width), h: String(photo.height) },
  });
}
