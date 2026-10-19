// Voice from the overlay's ring (chunk 27). The phone records what was said and sends it with the
// Advisor's snapshot; the backend turns it into words, lets the Advisor's tools decide and act, and
// answers with one short line that is shown and spoken word for word. Actions come back for the
// phone to apply to its own store (local-first): the server never writes the user's data.
//
//   POST /voice/turns  VoiceTurnRequest (the body + a base64 WAV)   →  VoiceReply | VoiceFailure
//   GET  /voice/speech/:id                                            →  PCM 24 kHz, 16-bit mono

import { z } from 'zod';

import { advisorContextSchema, advisorHistorySchema, advisorProblem, RED_FLAGS, tidySentence } from './advisor';
import { MAX_MEAL_NOTE, MEAL_TYPES } from './meals';

export const VOICE_LIMITS = {
  /** 20 s of 16 kHz 16-bit mono is 640 KB, plus the header. */
  audioBytes: 700_000,
  audioMs: 20_000,
  heard: 500,
  /** Spoken replies are shorter than written ones. */
  sentences: 2,
  words: 16,
  questions: 1,
  actions: 3,
  history: 6,
  toolRounds: 3,
  turnMs: 15_000,
  /** How long a reply's speech can be fetched. */
  speechMs: 120_000,
  speechRate: 24_000,
} as const;

const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// ── A turn ───────────────────────────────────────────────────────────────────────

/** The alarm the tap retracted: what the PA wanted when the user started talking. */
export const voiceFlagSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().min(1).max(60),
});
export type VoiceFlag = z.infer<typeof voiceFlagSchema>;

export const voiceTurnBodySchema = z.object({
  /** Client-made; the same id never runs twice. */
  turnId: z.uuid(),
  /** Today's Advisor thread, where the exchange is also kept. */
  threadId: dayKey,
  /** Null when the phone's snapshot is from an earlier day (Halo hasn't run since). */
  context: advisorContextSchema.nullable(),
  /** The end of today's thread, so "undo that" and follow-ups make sense. */
  history: z.array(advisorHistorySchema).max(VOICE_LIMITS.history),
  flag: voiceFlagSchema.nullable(),
});
export type VoiceTurnBody = z.infer<typeof voiceTurnBodySchema>;

/** The turn with its recording: a 16 kHz mono WAV as base64, like meal photos and report tiles. */
export const voiceTurnRequestSchema = voiceTurnBodySchema.extend({
  audio: z
    .string()
    .min(64)
    .max(Math.ceil((VOICE_LIMITS.audioBytes * 4) / 3) + 4)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/),
});
export type VoiceTurnRequest = z.infer<typeof voiceTurnRequestSchema>;

// ── What it may do ───────────────────────────────────────────────────────────────

/** Screens a voice reply can open over whatever app is in front. */
export const VOICE_OPEN_TARGETS = [
  'logger',
  'camera',
  'advisor',
  'weigh',
  'sleep_hours',
  'ask_wake',
  'usage_access',
  'connect',
  'blood_work',
] as const;
export type VoiceOpenTarget = (typeof VOICE_OPEN_TARGETS)[number];

/** Where each target opens in Halo. */
export const VOICE_OPEN_URLS: Record<VoiceOpenTarget, string> = {
  logger: 'haloapp://log',
  camera: 'haloapp://log?camera=1',
  advisor: 'haloapp://advisor',
  weigh: 'haloapp://weigh-in',
  sleep_hours: 'haloapp://sleep-hours',
  ask_wake: 'haloapp://wake-time',
  usage_access: 'haloapp://?ask=usage_access',
  connect: 'haloapp://?ask=connect',
  blood_work: 'haloapp://reports',
};

const label = z.string().min(1).max(80);

/**
 * Done at once on the phone. Logs carry the words for the notification and the Undo line; the
 * phone gives each its record id. `undo` takes back the last thing a voice reply logged.
 */
export const voiceActionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('meal'),
    /** What they said they ate, parsed on the phone like a typed meal. */
    description: z.string().trim().min(1).max(MAX_MEAL_NOTE),
    mealType: z.enum(MEAL_TYPES).nullable(),
    label,
  }),
  z.object({ kind: z.literal('water'), ml: z.number().int().min(50).max(2000), label }),
  z.object({ kind: z.literal('weight'), kg: z.number().min(25).max(300), label }),
  z.object({ kind: z.literal('undo'), label }),
  z.object({ kind: z.literal('open'), target: z.enum(VOICE_OPEN_TARGETS) }),
]);
export type VoiceAction = z.infer<typeof voiceActionSchema>;

/** The log's own words, as the notification and the overlay say them ("Logged two rotis and dal"). */
export function voiceActionLabel(
  action:
    | { kind: 'meal'; title: string }
    | { kind: 'water'; ml: number }
    | { kind: 'weight'; kg: number; pounds?: boolean }
    | { kind: 'undo' },
): string {
  switch (action.kind) {
    case 'meal': {
      const title = action.title.trim().replace(/[.!]+$/, '');
      // "Two rotis and dal" → "two rotis and dal"; "Paneer tikka" stays readable either way.
      const lower = /^\p{Lu}\p{Ll}/u.test(title) ? title[0]!.toLowerCase() + title.slice(1) : title;
      return `Logged ${lower}`.slice(0, 80);
    }
    case 'water':
      return `Added ${action.ml} ml water`;
    case 'weight':
      return action.pounds
        ? `Weight saved, ${Math.round(action.kg * 2.20462 * 10) / 10} lb`
        : `Weight saved, ${Math.round(action.kg * 10) / 10} kg`;
    case 'undo':
      return 'Taken back';
  }
}

// ── What comes back ──────────────────────────────────────────────────────────────

export const voiceReplySchema = z.object({
  turnId: z.uuid(),
  /** What was understood (the user's words, for the thread). */
  heard: z.string().max(VOICE_LIMITS.heard),
  /** Shown and spoken, word for word. */
  text: z.string().min(1).max(400),
  actions: z.array(voiceActionSchema).max(VOICE_LIMITS.actions),
  /** Fetch the spoken reply here; null when speech couldn't be prepared. */
  speech: z.object({ id: z.string().min(1).max(80), rate: z.number().int() }).nullable(),
  flag: z.enum(RED_FLAGS).nullable(),
});
export type VoiceReply = z.infer<typeof voiceReplySchema>;

export const VOICE_ERRORS = ['no_speech', 'too_long', 'unavailable', 'busy', 'timeout', 'failed'] as const;
export type VoiceError = (typeof VOICE_ERRORS)[number];

export const voiceFailureSchema = z.object({
  error: z.enum(VOICE_ERRORS),
  /** The line to show (never spoken). */
  line: z.string().min(1).max(80),
});
export type VoiceFailure = z.infer<typeof voiceFailureSchema>;

/**
 * Every line the overlay shows on its own. The ring's service has copies of the phone-side ones
 * (offline, on a call): keep them in step with OverlayService.kt.
 */
export const VOICE_LINES = {
  offline: 'No connection. Long-press to type it.',
  on_call: 'On a call.',
  no_speech: 'Didn’t catch that.',
  too_long: 'That was long. Try it in a few words.',
  unavailable: 'Voice isn’t available right now.',
  busy: 'Still on the last one.',
  timeout: 'Couldn’t answer that this time.',
  failed: 'Couldn’t answer that this time.',
  /** The reply when nothing it wanted to say passed the guard. */
  fallback: 'Say that another way.',
  /** Data questions while the phone's snapshot is from another day. */
  stale: 'Open Halo once to refresh today.',
} as const satisfies Record<VoiceError | 'offline' | 'on_call' | 'fallback' | 'stale', string>;

// ── The spoken guard ─────────────────────────────────────────────────────────────

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Why a sentence can't be spoken: the Advisor's rules, plus short and nothing to tap. */
export function voiceProblem(sentence: string): string | null {
  const problem = advisorProblem(sentence);
  if (problem) return problem;
  if (words(sentence) > VOICE_LIMITS.words) return 'long';
  // Nothing on the overlay is tapped because of a reply; a card would be the Advisor's way.
  if (/\btap\b/i.test(sentence)) return 'tap';
  return null;
}

/**
 * The Advisor's guard for a spoken reply: each sentence tidied and kept only if it passes, up to
 * two sentences and one question. `push` returns the sentence kept, or null.
 */
export function voiceGuard() {
  const kept: string[] = [];
  let questions = 0;
  return {
    push(sentence: string): string | null {
      if (kept.length >= VOICE_LIMITS.sentences) return null;
      const tidy = tidySentence(sentence);
      if (voiceProblem(tidy)) return null;
      const question = tidy.endsWith('?');
      if (question && questions >= VOICE_LIMITS.questions) return null;
      if (question) questions++;
      kept.push(tidy);
      return tidy;
    },
    get text() {
      return kept.join(' ');
    },
    get count() {
      return kept.length;
    },
  };
}

// ── Reading it aloud ─────────────────────────────────────────────────────────────

/** Units as they're said after a number. */
const SPOKEN_UNITS: Record<string, string> = {
  'mg/dL': 'milligrams per decilitre',
  'mmol/L': 'millimoles per litre',
  kcal: 'calories',
  kg: 'kilos',
  lb: 'pounds',
  ml: 'millilitres',
  min: 'minutes',
  bpm: 'beats a minute',
  h: 'hours',
  g: 'grams',
  '%': 'percent',
};

/**
 * The text as it should be read aloud: the same words, with ranges and unit symbols spelled out
 * ("7–8 h" → "7 to 8 hours", "250 ml" → "250 millilitres"), so the voice never reads a symbol.
 */
export function spokenText(text: string): string {
  return (
    text
      .replace(/(\d)\s?[–-]\s?(\d)/g, '$1 to $2')
      // A number, then a unit that ends there (not the start of a longer word).
      .replace(
        /(\d)\s?(mg\/dL|mmol\/L|kcal|kg|lb|ml|min|bpm|h|g|%)(?![\p{L}/])/gu,
        (_m, n: string, unit: string) => `${n} ${SPOKEN_UNITS[unit]}`,
      )
  );
}
