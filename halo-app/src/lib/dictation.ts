// Speaking into a note or a message, on the phone (the on-device recognizer, no server). Words
// stream into the field as they're recognised, after whatever was already typed; the user reads
// them and sends as usual.

import { useEffect, useRef, useState } from 'react';
import { PermissionsAndroid } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';

import Speech, { type SpeechError } from '../../modules/speech/src/SpeechModule';

export type DictationState = 'idle' | 'starting' | 'listening';

/** Why listening stopped without words, in a few plain words for the field's placeholder. */
const HINTS: Partial<Record<SpeechError | 'denied', string>> = {
  no_speech: 'Didn’t catch that',
  permission: 'Allow the microphone to speak',
  denied: 'Allow the microphone to speak',
  language: 'Getting the speech pack, try again soon',
  busy: 'Voice is busy, try again',
  unavailable: 'Voice isn’t available on this phone',
  error: 'Didn’t catch that',
};

/** Whether the mic is worth showing at all (module present and an on-device recognizer). */
export const dictationAvailable = (() => {
  try {
    return !!Speech?.isAvailable();
  } catch {
    return false;
  }
})();

/** The field listening right now: events go to it only (the logger stays mounted under the Advisor). */
let owner: symbol | null = null;

const join = (base: string, spoken: string) => {
  const s = spoken.trim();
  if (!s) return base;
  return base.trim() ? `${base.replace(/\s+$/, '')} ${s}` : s;
};

/**
 * Dictation into one field. `text` is the field's value and `setText` its setter; `level` (0-1)
 * follows the voice for the mic's ring, on the UI thread.
 */
export function useDictation(text: string, setText: (text: string) => void) {
  const [state, setState] = useState<DictationState>('idle');
  const [hint, setHint] = useState<string | null>(null);
  const level = useSharedValue(0);
  const base = useRef('');
  const id = useRef(Symbol('dictation')).current;
  const latest = useRef({ text, setText });
  latest.current = { text, setText };

  useEffect(() => {
    if (!Speech) return;
    const mine = () => owner === id;
    const subs = [
      Speech.addListener('onStart', () => mine() && setState('listening')),
      Speech.addListener('onPartial', ({ text: spoken }) => {
        if (mine()) latest.current.setText(join(base.current, spoken));
      }),
      Speech.addListener('onFinal', ({ text: spoken }) => {
        if (mine()) latest.current.setText(join(base.current, spoken));
      }),
      // RMS dB arrives roughly -2 (silence) to 10 (loud); mapped to 0-1.
      Speech.addListener('onLevel', ({ db }) => {
        if (mine()) level.set(Math.max(0, Math.min(1, (db + 2) / 12)));
      }),
      Speech.addListener('onError', ({ code }) => {
        if (!mine()) return;
        if (code === 'language') Speech?.downloadModel(null);
        setHint(HINTS[code] ?? HINTS.error!);
      }),
      Speech.addListener('onEnd', () => {
        if (!mine()) return;
        owner = null;
        setState('idle');
        level.set(0);
      }),
    ];
    return () => {
      subs.forEach((sub) => sub.remove());
      if (mine()) {
        Speech?.cancel();
        owner = null;
      }
    };
  }, [id, level]);

  // A hint clears itself after a few seconds.
  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(null), 4000);
    return () => clearTimeout(t);
  }, [hint]);

  const start = async () => {
    if (!Speech) return;
    setHint(null);
    const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
      setHint(HINTS.denied!);
      return;
    }
    base.current = latest.current.text;
    owner = id;
    setState('starting');
    Speech.start(null);
  };

  const stop = () => {
    if (owner === id) Speech?.stop();
  };

  return {
    available: dictationAvailable,
    state,
    listening: state !== 'idle',
    hint,
    level,
    toggle: () => (state === 'idle' ? void start() : stop()),
    cancel: () => {
      if (owner !== id) return;
      Speech?.cancel();
      owner = null;
      setState('idle');
    },
  };
}
