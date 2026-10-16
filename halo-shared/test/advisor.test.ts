import { describe, expect, it } from 'vitest';

import {
  ADVISOR_LIMITS,
  type AdvisorContext,
  type AdvisorEvent,
  advisorCardSchema,
  advisorContextSchema,
  advisorEventSchema,
  advisorProblem,
  advisorTurnBodySchema,
  entryQuestion,
  RED_FLAG_REPLY,
  redFlag,
  replyGuard,
  splitSentences,
  sseData,
  starterQuestion,
  sseFrame,
  tidySentence,
  trimHistory,
} from '../src/advisor';
import { labResults, type LabReading, surfaceFactors } from '../src/blood-work';
import { BANNED } from '../src/phrase';
import { type Area, type AreaKey, areaState } from '../src/vitals';

const DAY = '2026-10-16';

const context: AdvisorContext = {
  profile: { age: 29, sex: 'male', heightCm: 176, units: 'metric', clock24: true },
  plan: {
    goal: 'lose',
    kcal: 2100,
    kcalFloor: 1500,
    proteinG: 140,
    carbsG: 230,
    fatG: 65,
    waterMl: 2500,
    steps: 8000,
    sleepNeedH: 7.5,
    goalWeightKg: 72,
  },
  today: {
    day: DAY,
    hour: 13.5,
    clock: '13:30',
    scores: { overall: 71, diet: 64, activity: 70, vitals: 76 },
    intake: { kcal: 820, proteinG: 41, carbsG: 96, fatG: 28 },
    expected: { kcal: 1000, proteinG: 66 },
    waterMl: 1250,
    steps: 4310,
    sleep: { hours: 6.4, source: 'Estimated' },
    brief: { title: 'Protein is behind', line: 'A dal and paneer lunch closes most of it.' },
  },
  vitals: {
    areas: [
      { key: 'sleep', state: 'needs_care', words: '6.4 h last night, under your usual 7.1–7.8 h.', step: null, source: 'estimated' },
    ],
    rows: [
      { key: 'glucose', area: 'heart', label: 'Glucose', value: '96 mg/dL', stateWord: 'In range', expected: '70–99', source: 'Lab report' },
    ],
  },
  blood: null,
  days: [],
  meals: [],
  sessions: [],
  connected: { healthConnect: true, screenTime: true },
};

const body = (over: Record<string, unknown> = {}) => ({
  threadId: DAY,
  turnId: '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed',
  message: 'Why does my sleep need care?',
  history: [],
  context,
  entry: 'vitals',
  ...over,
});

describe('turn body', () => {
  it('accepts a full turn and trims the message', () => {
    const parsed = advisorTurnBodySchema.parse(body({ message: '  Log lunch  ' }));
    expect(parsed.message).toBe('Log lunch');
  });

  it('refuses an empty or overlong message, a bad turn id and a thread that is not a day', () => {
    expect(advisorTurnBodySchema.safeParse(body({ message: '   ' })).success).toBe(false);
    expect(advisorTurnBodySchema.safeParse(body({ message: 'a'.repeat(ADVISOR_LIMITS.message + 1) })).success).toBe(false);
    expect(advisorTurnBodySchema.safeParse(body({ turnId: 'turn-1' })).success).toBe(false);
    expect(advisorTurnBodySchema.safeParse(body({ threadId: 'thread' })).success).toBe(false);
  });

  it('caps the snapshot: 14 days, no internal area scores', () => {
    const day = { day: DAY, sleepH: 7, steps: 8000, activeKcal: null, exerciseMin: null, kcal: null, proteinG: null, waterMl: null, weightKg: null, restingHr: null, hrv: null, hcHydrationMl: null, hcNutritionKcal: null, overall: null };
    expect(advisorContextSchema.safeParse({ ...context, days: Array(14).fill(day) }).success).toBe(true);
    expect(advisorContextSchema.safeParse({ ...context, days: Array(15).fill(day) }).success).toBe(false);
    const withScore = { ...context, vitals: { ...context.vitals, areas: [{ ...context.vitals.areas[0], score: 54 }] } };
    const parsed = advisorContextSchema.parse(withScore);
    expect(parsed.vitals.areas[0]).not.toHaveProperty('score');
  });
});

describe('cards', () => {
  it('holds every value to a believable range', () => {
    expect(advisorCardSchema.safeParse({ kind: 'water', ml: 250 }).success).toBe(true);
    expect(advisorCardSchema.safeParse({ kind: 'water', ml: 20 }).success).toBe(false);
    expect(advisorCardSchema.safeParse({ kind: 'water', ml: 5000 }).success).toBe(false);
    expect(advisorCardSchema.safeParse({ kind: 'weight', kg: 74.2 }).success).toBe(true);
    expect(advisorCardSchema.safeParse({ kind: 'weight', kg: 400 }).success).toBe(false);
    expect(advisorCardSchema.safeParse({ kind: 'exercise', title: 'Walk', minutes: 20, moves: ['Walk'], at: null }).success).toBe(false);
    expect(
      advisorCardSchema.safeParse({ kind: 'exercise', title: 'Easy walk', minutes: 20, moves: ['Warm up', 'Brisk walk'], at: '18:00' }).success,
    ).toBe(true);
    expect(advisorCardSchema.safeParse({ kind: 'open', target: 'blood_work' }).success).toBe(true);
    expect(advisorCardSchema.safeParse({ kind: 'open', target: 'settings' }).success).toBe(false);
  });

  it('has no card for a heart or lab reading (19e: no manual heart readings)', () => {
    expect(advisorCardSchema.safeParse({ kind: 'reading', metric: 'resting_hr', value: 60 }).success).toBe(false);
  });

  it('takes a meal only with items, each within range', () => {
    const item = { name: 'Dal', portion: '1 bowl', grams: 200, kcal: 230, proteinG: 12, carbsG: 30, fatG: 6 };
    expect(advisorCardSchema.safeParse({ kind: 'meal', title: 'Dal rice', mealType: 'lunch', items: [item] }).success).toBe(true);
    expect(advisorCardSchema.safeParse({ kind: 'meal', title: 'Dal rice', mealType: 'lunch', items: [] }).success).toBe(false);
    expect(
      advisorCardSchema.safeParse({ kind: 'meal', title: 'Dal rice', mealType: 'lunch', items: [{ ...item, kcal: 9000 }] }).success,
    ).toBe(false);
  });
});

describe('events', () => {
  it('round-trips through SSE frames, skipping comments and keeping the unfinished rest', () => {
    const events: AdvisorEvent[] = [
      { type: 'status', label: 'Checking your sleep' },
      { type: 'delta', text: '6.4 h last night, under your usual 7.1–7.8 h.' },
      { type: 'card', card: { kind: 'open', target: 'sleep_hours' } },
      { type: 'done', text: '6.4 h last night, under your usual 7.1–7.8 h.', cards: [{ kind: 'open', target: 'sleep_hours' }], flag: null },
    ];
    const stream = `: open\n\n${events.map((e) => sseFrame(e)).join(': ping\n\n')}data: {"type":"del`;
    const { data, rest } = sseData(stream);
    expect(data.map((d) => advisorEventSchema.parse(JSON.parse(d)))).toEqual(events);
    expect(rest).toBe('data: {"type":"del');
  });

  it('reads DeepSeek-style frames with CRLF and no space after the colon', () => {
    const { data } = sseData('data:{"a":1}\r\n\r\n: keep-alive\r\n\r\ndata: [DONE]\r\n\r\n');
    expect(data).toEqual(['{"a":1}', '[DONE]']);
  });
});

describe('redFlag', () => {
  it('sends urgent symptoms to a doctor now', () => {
    for (const m of [
      'I have chest pain after climbing stairs',
      'pressure in my chest since an hour',
      "I can't breathe properly",
      'I fainted at the gym',
      'my face is drooping on one side',
      'my throat is swelling after the peanuts',
      'there was blood in my stool',
      'I think I overdosed on paracetamol',
      'my son had a seizure',
      'worst headache of my life',
    ]) {
      expect(redFlag(m), m).toBe('urgent');
    }
  });

  it('sends crisis words to a crisis line, ahead of anything urgent', () => {
    for (const m of [
      'I want to die',
      "I don't want to wake up tomorrow",
      'thinking about suicide',
      'I have been cutting myself',
      'I make myself throw up after dinner',
      'I want to overdose and end it all',
    ]) {
      expect(redFlag(m), m).toBe('crisis');
    }
  });

  it('lets negations and everyday words through', () => {
    for (const m of [
      'No chest pain, just tired',
      "I don't have chest pain but my legs ache",
      'never fainted, just dizzy for a second',
      'I am dying for a coffee',
      'How do I bring LDL back into range?',
      'My blood sugar was 96',
      'Log a glass of water',
      'Took my vitamin D tablet',
    ]) {
      expect(redFlag(m), m).toBeNull();
    }
  });

  it('replies plainly, with an emergency number and no banned habits', () => {
    for (const reply of Object.values(RED_FLAG_REPLY)) {
      expect(reply).toMatch(/112/);
      expect(reply).not.toMatch(/[!—–]/);
      expect(reply).not.toMatch(/\bAI\b|\bI\b/);
    }
  });
});

describe('the sentence guard', () => {
  it('tidies dashes, bangs, emoji and markdown, keeping number ranges', () => {
    expect(tidySentence('Your sleep needs care — 5.9 h last night, under your usual 7.1–7.8 h!')).toBe(
      'Your sleep needs care, 5.9 h last night, under your usual 7.1–7.8 h.',
    );
    expect(tidySentence('- **Walk** for 10 min after lunch 🚶')).toBe('Walk for 10 min after lunch');
    expect(tidySentence('Aim for 7-8 h; bed by 23:00.')).toBe('Aim for 7–8 h, bed by 23:00.');
  });

  it('keeps plain facts with their comparison', () => {
    for (const s of [
      '6.4 h last night, under your usual 7.1–7.8 h.',
      'LDL is 142 mg/dL, above range · under 100.',
      'A 15-minute walk after dinner helps blood sugar.',
      'Worth showing your doctor.',
      'Protein is 25 g behind for this time of day.',
    ]) {
      expect(advisorProblem(tidySentence(s)), s).toBeNull();
    }
  });

  it('drops diagnoses, condition names, dosing and drugs', () => {
    for (const s of [
      'This could be a sign of diabetes.',
      'You may have anaemia.',
      'Vitamin D deficiency is common.',
      'Take 1000 IU of vitamin D a day.',
      'A statin would bring this down.',
      'Try a magnesium supplement before bed.',
      'This sounds like insomnia.',
    ]) {
      expect(advisorProblem(tidySentence(s)), s).not.toBeNull();
    }
  });

  it('drops goal lists, internal scores and the AI voice', () => {
    for (const s of [
      'Here are your goals for this week.',
      'Set a goal for vitamin D.',
      'Your sleep scored 54 out of 100.',
      'Great job on the steps.',
      "I'll check your vitals for today.",
      "Let's look at your sleep.",
      'As an AI, advice is general.',
      'It looks like you slept less.',
    ]) {
      expect(advisorProblem(tidySentence(s)), s).not.toBeNull();
    }
  });

  it('keeps three sentences at most, one question, and only clean ones', () => {
    const guard = replyGuard();
    const out = [
      "I'll check your sleep first.",
      '6.4 h last night, under your usual 7.1–7.8 h.',
      'Is the phone in bed with you?',
      'Was it a late dinner?',
      'Bed by 23:00 tonight gets you there.',
      'One more line.',
    ].map((s) => guard.push(s));
    expect(out).toEqual([
      null,
      '6.4 h last night, under your usual 7.1–7.8 h.',
      'Is the phone in bed with you?',
      null,
      'Bed by 23:00 tonight gets you there.',
      null,
    ]);
    expect(guard.count).toBe(3);
    expect(guard.text).toBe('6.4 h last night, under your usual 7.1–7.8 h. Is the phone in bed with you? Bed by 23:00 tonight gets you there.');
  });

  it('shares the brief guard: every banned habit is still banned here', () => {
    for (const rule of BANNED) expect(rule.flags.includes('g')).toBe(false);
    expect(advisorProblem('Remember to drink water.')).not.toBeNull();
    expect(advisorProblem('Water is behind; add a glass.')).not.toBeNull();
  });
});

describe('splitSentences', () => {
  it('waits for whitespace after a stop, so decimals and units mid-stream stay whole', () => {
    expect(splitSentences('Your LDL is 14')).toEqual({ sentences: [], rest: 'Your LDL is 14' });
    expect(splitSentences('Your LDL is 142.')).toEqual({ sentences: [], rest: 'Your LDL is 142.' });
    expect(splitSentences('Sleep was 6.5 h. Bed by 23:00 tonight')).toEqual({
      sentences: ['Sleep was 6.5 h.'],
      rest: 'Bed by 23:00 tonight',
    });
  });

  it('does not split after abbreviations, and keeps closing quotes', () => {
    expect(splitSentences('Pick a protein, e.g. paneer or eggs. Then water.', true).sentences).toEqual([
      'Pick a protein, e.g. paneer or eggs.',
      'Then water.',
    ]);
    expect(splitSentences('Say "Log lunch." Then it is done.', true).sentences).toEqual(['Say "Log lunch."', 'Then it is done.']);
  });

  it('ends on questions and line breaks, and flushes the rest when final', () => {
    expect(splitSentences('Late dinner? A walk helps\nBed by 23:00', true).sentences).toEqual([
      'Late dinner?',
      'A walk helps',
      'Bed by 23:00',
    ]);
  });
});

describe('trimHistory', () => {
  const msg = (role: 'user' | 'assistant', n: number, len = 40) => ({ role, content: `${n} `.padEnd(len, 'x') });

  it('keeps the newest messages within the count, oldest first', () => {
    const history = Array.from({ length: 20 }, (_, i) => msg(i % 2 ? 'assistant' : 'user', i));
    const kept = trimHistory(history);
    expect(kept.length).toBeLessThanOrEqual(ADVISOR_LIMITS.historyMessages);
    expect(kept.at(-1)!.content.startsWith('19 ')).toBe(true);
    expect(kept[0]!.role).toBe('user');
  });

  it('stops at the token budget and never starts with a reply', () => {
    // Each message is capped at 2,000 characters (≈500 tokens): six fit the 3,000-token budget.
    const history = Array.from({ length: 7 }, (_, i) => msg(i % 2 ? 'assistant' : 'user', i, 5000));
    const kept = trimHistory(history);
    expect(kept.map((m) => m.content.split(' ')[0])).toEqual(['2', '3', '4', '5', '6']);
    expect(kept.every((m) => m.content.length === ADVISOR_LIMITS.historyMessage)).toBe(true);
    expect(trimHistory([msg('assistant', 0), msg('user', 1)])).toEqual([msg('user', 1)]);
  });
});

describe('entryQuestion', () => {
  const area = (key: AreaKey, score: number, source: Area['source'] = 'measured'): Area => ({
    key,
    score,
    state: areaState(score),
    confidence: 1,
    source,
    signals: [],
  });
  const factors = (rs: { metric: string; value: number; refLo?: number; refHi?: number }[]) =>
    surfaceFactors(
      labResults(
        rs.map(
          (r, i): LabReading => ({
            id: `r${i}`,
            metric: r.metric,
            label: null,
            value: r.value,
            unit: 'mg/dL',
            qualifier: null,
            refLo: r.refLo ?? null,
            refHi: r.refHi ?? null,
            day: DAY,
            reportId: 'rep',
          }),
        ),
      ),
    );

  it('asks about the area the hero leads with', () => {
    expect(entryQuestion('vitals', [area('sleep', 40), area('heart', 85), area('movement', 75)], [], 'maintain')).toBe(
      'Why does my sleep need care?',
    );
    expect(entryQuestion('vitals', [area('sleep', 85), area('heart', 90), area('screen', 65)], [], 'maintain')).toBe(
      'What would help my evenings most?',
    );
  });

  it('turns to the blood factor that speaks first, by the plan, when blood work leads or nothing does', () => {
    const fs = factors([
      { metric: 'haemoglobin', value: 12.6, refLo: 13, refHi: 17 },
      { metric: 'ldl', value: 120, refHi: 100 },
    ]);
    const thriving = [area('sleep', 90), area('heart', 92), area('movement', 88)];
    expect(entryQuestion('vitals', thriving, fs, 'lose')).toBe('How do I bring LDL cholesterol back into range?');
    expect(entryQuestion('vitals', thriving, fs, 'gain')).toMatch(/^How do I bring haemoglobin back into range\?$/i);
    const far = factors([{ metric: 'ldl', value: 190, refHi: 100 }]);
    expect(entryQuestion('vitals', thriving, far, 'maintain')).toBe('What should I do about my LDL cholesterol result?');
  });

  it('falls back to keeping things steady, and Plus brings no question', () => {
    expect(entryQuestion('vitals', [area('sleep', 90), area('heart', 92)], [], 'maintain')).toBe('What keeps my vitals steady?');
    expect(entryQuestion('plus', [area('sleep', 40)], [], 'maintain')).toBeNull();
    expect(entryQuestion(null, [area('sleep', 40)], [], 'maintain')).toBeNull();
  });
});

describe('starterQuestion', () => {
  it('asks about what the brief is about, in the user voice, never with goals', () => {
    expect(starterQuestion({ type: 'protein_pace', facts: {} })).toBe('How do I close the protein gap today?');
    expect(starterQuestion({ type: 'meal_window', facts: { meal: 'dinner' } })).toBe('What makes a good dinner for me?');
    expect(starterQuestion({ type: 'on_track', facts: {} })).toBe('What matters most today?');
    expect(starterQuestion(null)).toBe('What matters most today?');
    for (const type of ['protein_pace', 'calorie_over', 'blood_work', 'weekly_review'] as const) {
      expect(starterQuestion({ type, facts: {} })).not.toMatch(/\bgoals?\b|\bAI\b/i);
    }
  });
});
