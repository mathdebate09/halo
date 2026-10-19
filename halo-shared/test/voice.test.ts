import { describe, expect, it } from 'vitest';

import {
  spokenText,
  VOICE_LIMITS,
  VOICE_LINES,
  VOICE_OPEN_TARGETS,
  VOICE_OPEN_URLS,
  voiceActionLabel,
  voiceActionSchema,
  voiceFailureSchema,
  voiceGuard,
  voiceProblem,
  voiceReplySchema,
  voiceTurnBodySchema,
  voiceTurnRequestSchema,
} from '../src/voice';
import { BANNED } from '../src/phrase';

const TURN = '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed';

const body = (over: Record<string, unknown> = {}) => ({
  turnId: TURN,
  threadId: '2026-10-20',
  context: null,
  history: [],
  flag: { id: '2026-10-20:water_pace', title: 'Catch up on water' },
  ...over,
});

describe('turn body', () => {
  it('accepts a turn without a snapshot (stale phone) and with the retracted flag', () => {
    expect(voiceTurnBodySchema.safeParse(body()).success).toBe(true);
    expect(voiceTurnBodySchema.safeParse(body({ flag: null })).success).toBe(true);
  });

  it('refuses a bad turn id, a thread that is not a day and too much history', () => {
    expect(voiceTurnBodySchema.safeParse(body({ turnId: 'turn-1' })).success).toBe(false);
    expect(voiceTurnBodySchema.safeParse(body({ threadId: 'today' })).success).toBe(false);
    const history = Array.from({ length: VOICE_LIMITS.history + 1 }, () => ({ role: 'user', content: 'hi' }));
    expect(voiceTurnBodySchema.safeParse(body({ history })).success).toBe(false);
  });
});

describe('turn request', () => {
  it('carries the recording as base64 within the size cap', () => {
    const audio = Buffer.alloc(32_000).toString('base64');
    expect(voiceTurnRequestSchema.safeParse({ ...body(), audio }).success).toBe(true);
    expect(voiceTurnRequestSchema.safeParse({ ...body(), audio: 'not base64!' }).success).toBe(false);
    const big = Buffer.alloc(VOICE_LIMITS.audioBytes + 3000).toString('base64');
    expect(voiceTurnRequestSchema.safeParse({ ...body(), audio: big }).success).toBe(false);
  });
});

describe('actions', () => {
  it('keeps logs in the same ranges as the Advisor cards', () => {
    expect(voiceActionSchema.safeParse({ kind: 'water', ml: 250, label: 'Added 250 ml water' }).success).toBe(true);
    expect(voiceActionSchema.safeParse({ kind: 'water', ml: 5000, label: 'x' }).success).toBe(false);
    expect(voiceActionSchema.safeParse({ kind: 'weight', kg: 12, label: 'x' }).success).toBe(false);
    expect(
      voiceActionSchema.safeParse({ kind: 'meal', description: 'two rotis and dal', mealType: null, label: 'Logged two rotis and dal' })
        .success,
    ).toBe(true);
    expect(voiceActionSchema.safeParse({ kind: 'meal', description: ' ', mealType: null, label: 'x' }).success).toBe(false);
  });

  it('opens only known screens, each with a Halo link', () => {
    expect(voiceActionSchema.safeParse({ kind: 'open', target: 'camera' }).success).toBe(true);
    expect(voiceActionSchema.safeParse({ kind: 'open', target: 'settings' }).success).toBe(false);
    for (const target of VOICE_OPEN_TARGETS) expect(VOICE_OPEN_URLS[target]).toMatch(/^haloapp:\/\//);
  });

  it('words each log plainly', () => {
    expect(voiceActionLabel({ kind: 'meal', title: 'Two rotis and dal.' })).toBe('Logged two rotis and dal');
    expect(voiceActionLabel({ kind: 'meal', title: 'BLT sandwich' })).toBe('Logged BLT sandwich');
    expect(voiceActionLabel({ kind: 'water', ml: 250 })).toBe('Added 250 ml water');
    expect(voiceActionLabel({ kind: 'weight', kg: 72.44 })).toBe('Weight saved, 72.4 kg');
    expect(voiceActionLabel({ kind: 'weight', kg: 72.44, pounds: true })).toBe('Weight saved, 159.7 lb');
    expect(voiceActionLabel({ kind: 'undo' })).toBe('Taken back');
  });
});

describe('reply and failure', () => {
  it('carries the text, the actions and where to fetch the speech', () => {
    const reply = {
      turnId: TURN,
      heard: 'had two rotis and dal',
      text: 'Logged two rotis and dal.',
      actions: [{ kind: 'meal', description: 'two rotis and dal', mealType: 'lunch', label: 'Logged two rotis and dal' }],
      speech: { id: 'abc', rate: VOICE_LIMITS.speechRate },
      flag: null,
    };
    expect(voiceReplySchema.safeParse(reply).success).toBe(true);
    expect(voiceReplySchema.safeParse({ ...reply, actions: Array(4).fill(reply.actions[0]) }).success).toBe(false);
  });

  it('has a line for every error, none of them reading like a machine', () => {
    for (const [key, line] of Object.entries(VOICE_LINES)) {
      expect(line.length, key).toBeLessThanOrEqual(80);
      for (const rule of BANNED) expect(rule.test(line), `${key}: ${rule.source}`).toBe(false);
      expect(line).not.toMatch(/\bAI\b|assistant|model/i);
    }
    expect(voiceFailureSchema.safeParse({ error: 'no_speech', line: VOICE_LINES.no_speech }).success).toBe(true);
  });
});

describe('spoken guard', () => {
  it('keeps two short sentences and one question', () => {
    const guard = voiceGuard();
    expect(guard.push('Protein is at 41 of 140 g, behind the 66 g expected by now.')).not.toBeNull();
    expect(guard.push('A paneer lunch closes most of it?')).not.toBeNull();
    expect(guard.push('Water is fine too.')).toBeNull();
    expect(guard.text).toBe('Protein is at 41 of 140 g, behind the 66 g expected by now. A paneer lunch closes most of it?');
  });

  it('drops long sentences, taps and what the Advisor would drop', () => {
    expect(voiceProblem('Tap to log it.')).toBe('tap');
    expect(voiceProblem('This is a sentence that simply goes on for far too many words to be said aloud by the ring quickly.')).toBe(
      'long',
    );
    expect(voiceProblem('That could be diabetes.')).toBe('diagnostic');
    const guard = voiceGuard();
    expect(guard.push('Great job!')).toBeNull();
    expect(guard.count).toBe(0);
  });

  it('allows only one question', () => {
    const guard = voiceGuard();
    expect(guard.push('Lunch or dinner?')).not.toBeNull();
    expect(guard.push('How much rice?')).toBeNull();
  });
});

describe('reading aloud', () => {
  it('spells out ranges and units after numbers', () => {
    expect(spokenText('6.4 h last night, under your usual 7.1–7.8 h.')).toBe(
      '6.4 hours last night, under your usual 7.1 to 7.8 hours.',
    );
    expect(spokenText('Added 250 ml. 1,250 of 2,500 ml today.')).toBe('Added 250 millilitres. 1,250 of 2,500 millilitres today.');
    expect(spokenText('Glucose 96 mg/dL, expected 70–99.')).toBe('Glucose 96 milligrams per decilitre, expected 70 to 99.');
    expect(spokenText('820 of 2,100 kcal and 41 g protein.')).toBe('820 of 2,100 calories and 41 grams protein.');
    expect(spokenText('Oxygen 95–100%, 72 kg, 30 min.')).toBe('Oxygen 95 to 100 percent, 72 kilos, 30 minutes.');
  });

  it('leaves words that only start like a unit', () => {
    expect(spokenText('8 glasses and 3 hours')).toBe('8 glasses and 3 hours');
    expect(spokenText('Bed by 2 am')).toBe('Bed by 2 am');
  });
});
