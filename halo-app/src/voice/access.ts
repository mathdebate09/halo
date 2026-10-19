// Talking to the ring (chunk 27): the user agrees once that what they say goes to OpenAI, and
// allows the mic. Asked in onboarding and from Today's mic button, never mid-task; the ring itself
// opens /voice-access until both are done.

import { useEffect, useState } from 'react';
import { AppState, Linking, PermissionsAndroid } from 'react-native';

import { kv } from '@/lib/kv';

import Overlay from '../../modules/overlay/src/OverlayModule';

const CONSENT_KEY = 'voice.allowed';

export type VoiceAccess = 'allowed' | 'needed' | 'unavailable';

const listeners = new Set<() => void>();
/** The last answer, so a second hook (the card inside the sheet) starts with it, not empty. */
let last: VoiceAccess | null = null;

/** Whether this build has the ring's voice (the 27d rebuild). */
export const voiceBuilt = () => typeof Overlay?.setVoice === 'function';

export const voiceConsented = () => kv.getBoolean(CONSENT_KEY) === true;

export async function voiceAccess(): Promise<VoiceAccess> {
  if (!voiceBuilt()) last = 'unavailable';
  else if (!voiceConsented()) last = 'needed';
  else
    last = (await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO))
      ? 'allowed'
      : 'needed';
  return last;
}

/**
 * The user tapped Allow: that's the consent; then the mic. If Android won't ask again, its app page
 * opens instead. Resolves to the new state.
 */
export async function allowVoice(): Promise<VoiceAccess> {
  kv.set(CONSENT_KEY, true);
  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
  if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) void Linking.openSettings();
  for (const listener of listeners) listener();
  return voiceAccess();
}

/** Re-read on every return to Halo (the mic may have been changed in Settings) and after Allow. */
export function useVoiceAccess(): VoiceAccess | null {
  const [access, setAccess] = useState<VoiceAccess | null>(last);
  useEffect(() => {
    let alive = true;
    const read = () => void voiceAccess().then((a) => alive && setAccess(a));
    read();
    listeners.add(read);
    const sub = AppState.addEventListener('change', (state) => state === 'active' && read());
    return () => {
      alive = false;
      listeners.delete(read);
      sub.remove();
    };
  }, []);
  return access;
}
