// The card as a 1080 × 1920 PNG, then to the gallery, the share sheet, or Instagram Stories.

import { getContentUriAsync } from 'expo-file-system/legacy';
import { startActivityAsync } from 'expo-intent-launcher';
import { Asset, requestPermissionsAsync } from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import type { RefObject } from 'react';
import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

export const EXPORT_WIDTH = 1080;
export const EXPORT_HEIGHT = 1920;

export function renderCard(card: RefObject<View | null>) {
  return captureRef(card, {
    format: 'png',
    width: EXPORT_WIDTH,
    height: EXPORT_HEIGHT,
    result: 'tmpfile',
  });
}

/** Write-only access is enough to add the PNG to the gallery. */
export async function saveToGallery(uri: string) {
  const permission = await requestPermissionsAsync(true);
  if (!permission.granted) return false;
  await Asset.create(uri);
  return true;
}

export function shareImage(uri: string) {
  return Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your day' });
}

const FLAG_GRANT_READ_URI_PERMISSION = 1;
const FLAG_ACTIVITY_NEW_TASK = 0x10000000;

/**
 * Instagram's "Add to Story" intent with the card as the background. Only Instagram handles the
 * action, so if it isn't installed the start fails at once and the system share sheet opens instead.
 * The promise only settles when the user returns from Instagram, so it isn't awaited.
 */
export async function shareToStory(uri: string) {
  const contentUri = await getContentUriAsync(uri);
  startActivityAsync('com.instagram.share.ADD_TO_STORY', {
    data: contentUri,
    type: 'image/png',
    flags: FLAG_GRANT_READ_URI_PERMISSION | FLAG_ACTIVITY_NEW_TASK,
  }).catch(() => shareImage(uri));
}
