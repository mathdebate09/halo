// GENERATED from halo-shared/src/advisor.ts by halo-shared/scripts/sync.mjs. Do not edit.

// The Advisor (SPEC §3 Vitals, §5 pattern 3). Each turn carries a snapshot of what the phone
// knows (nothing personal beyond it is kept on the server), the reply streams back as whole
// sentences over SSE (or is polled), and at most one card offers the next step, acted on with one
// tap. Both sides use the same safety rails: red flags short-circuit to a fixed reply, and every
// sentence passes the guard before it is shown.
//
//   POST /advisor/turns  AdvisorTurnBody  →  SSE AdvisorEvent… | 202 { turnId }
//   GET  /advisor/turns/:id               →  AdvisorTurnState

import { z } from 'zod';

import type { Factor, FactorKey } from './blood-work';
import { MEAL_TYPES } from './meals';
import { BANNED } from './phrase';
import { type InsightFacts, type InsightKind, leadFactor } from './signals';
import type { Area, AreaKey } from './vitals';
import { vitalsHeadline } from './vitals';

export const ADVISOR_LIMITS = {
  message: 1000,
  /** Earlier messages sent with a turn, newest kept first. */
  historyMessages: 12,
  historyTokens: 3000,
  historyMessage: 2000,
  /** A reply: short sentences, at most one of them a question. */
  sentences: 3,
  sentence: 280,
  questions: 1,
  toolRounds: 4,
  turnMs: 25_000,
} as const;

const AREA_KEYS = ['sleep', 'heart', 'movement', 'screen', 'body', 'blood'] as const satisfies readonly AreaKey[];
const FACTOR_KEYS = [
  'cholesterol',
  'blood_sugar',
  'haemoglobin',
  'vitamin_d',
  'b12',
  'thyroid',
] as const satisfies readonly FactorKey[];

const text = (max: number) => z.string().max(max);
const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const clock = z.string().regex(/^\d{2}:\d{2}$/);
const amount = (max: number) => z.number().min(0).max(max);
const maybe = (max: number) => amount(max).nullable();

// ── The snapshot ───────────────────────────────────────────────────────────────
// Facts as the screens show them (state words, expected values, sources), never the internal
// 0-100 scores behind them, so a reply can't cite one.

const vitalsAreaSchema = z.object({
  key: z.enum(AREA_KEYS),
  state: z.enum(['thriving', 'steady', 'needs_care']),
  /** The area card's sentence. */
  words: text(240),
  step: text(160).nullable(),
  source: z.enum(['measured', 'estimated', 'assumed']),
});

const vitalsRowSchema = z.object({
  key: text(32),
  area: z.enum(AREA_KEYS),
  label: text(40),
  /** As shown: "6.6 h", "118/76". */
  value: text(24),
  stateWord: text(40).nullable(),
  expected: text(40).nullable(),
  /** "Health Connect", "Lab report", "Your entry", "Estimated". */
  source: text(24),
});

const labRowSchema = z.object({
  key: text(48),
  label: text(48),
  /** As shown, with the unit: "142 mg/dL", "< 0.5 mg/L". */
  value: text(32),
  stateWord: text(24).nullable(),
  expected: text(32).nullable(),
  trend: text(32).nullable(),
  day: dayKey,
  far: z.boolean(),
});

const factorSchema = z.object({
  key: z.enum(FACTOR_KEYS),
  label: text(32),
  lead: labRowSchema,
  step: text(160).nullable(),
});

const dayRowSchema = z.object({
  day: dayKey,
  sleepH: maybe(24),
  steps: maybe(200_000),
  activeKcal: maybe(10_000),
  exerciseMin: maybe(1440),
  kcal: maybe(20_000),
  proteinG: maybe(1000),
  waterMl: maybe(20_000),
  weightKg: maybe(400),
  restingHr: maybe(250),
  hrv: maybe(400),
  /** From other apps through Health Connect: context only, never counted in the day. */
  hcHydrationMl: maybe(20_000),
  hcNutritionKcal: maybe(20_000),
  overall: maybe(100),
});

const mealRowSchema = z.object({
  title: text(80),
  mealType: z.enum(MEAL_TYPES),
  at: clock,
  kcal: amount(10_000),
  proteinG: amount(1000),
  carbsG: amount(2000),
  fatG: amount(1000),
  items: z.array(z.object({ name: text(80), portion: text(40) })).max(16),
});

const sessionSchema = z.object({
  day: dayKey,
  type: text(32),
  minutes: amount(1440),
  distanceKm: maybe(500),
  kcal: maybe(10_000),
});

export const advisorContextSchema = z.object({
  profile: z.object({
    age: z.number().int().min(13).max(120),
    sex: z.enum(['female', 'male']).nullable(),
    heightCm: maybe(260),
    units: z.enum(['metric', 'imperial']),
    clock24: z.boolean(),
  }),
  /** The one goal: the plan. It only orders what is said first. */
  plan: z.object({
    goal: z.enum(['lose', 'maintain', 'gain']),
    kcal: amount(10_000),
    kcalFloor: amount(5000),
    proteinG: amount(1000),
    carbsG: amount(2000),
    fatG: amount(1000),
    waterMl: amount(20_000),
    steps: amount(200_000),
    sleepNeedH: amount(24),
    goalWeightKg: maybe(400),
  }),
  today: z.object({
    day: dayKey,
    /** Hours into the app's day (00:30 = 24.5) and the local clock. */
    hour: z.number().min(0).max(30),
    clock,
    /** The scores the user sees on Today and Vitals. */
    scores: z.object({ overall: amount(100), diet: amount(100), activity: amount(100), vitals: amount(100) }),
    intake: z.object({ kcal: amount(20_000), proteinG: amount(1000), carbsG: amount(2000), fatG: amount(1000) }),
    /** Where intake would be by now on pace. */
    expected: z.object({ kcal: amount(20_000), proteinG: amount(1000) }),
    waterMl: amount(20_000),
    steps: amount(200_000),
    sleep: z.object({ hours: maybe(24), source: text(24) }),
    brief: z.object({ title: text(80), line: text(200) }).nullable(),
  }),
  vitals: z.object({
    areas: z.array(vitalsAreaSchema).max(AREA_KEYS.length),
    rows: z.array(vitalsRowSchema).max(40),
  }),
  blood: z
    .object({
      addedDay: dayKey,
      factors: z.array(factorSchema).max(FACTOR_KEYS.length),
      /** Every test's latest result, for questions about one that isn't a familiar factor. */
      results: z.array(labRowSchema).max(120),
    })
    .nullable(),
  days: z.array(dayRowSchema).max(14),
  meals: z.array(mealRowSchema).max(12),
  sessions: z.array(sessionSchema).max(30),
  /** Sources already set up: the Advisor never offers to connect them again. */
  connected: z.object({ healthConnect: z.boolean(), screenTime: z.boolean() }),
});
export type AdvisorContext = z.infer<typeof advisorContextSchema>;

// ── A turn ───────────────────────────────────────────────────────────────────────

export const ADVISOR_ENTRIES = ['vitals', 'plus'] as const;
export type AdvisorEntry = (typeof ADVISOR_ENTRIES)[number];

export const advisorHistorySchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(ADVISOR_LIMITS.historyMessage),
});
export type AdvisorHistoryItem = z.infer<typeof advisorHistorySchema>;

export const advisorTurnBodySchema = z.object({
  /** One thread per day: the day key. */
  threadId: dayKey,
  /** Client-made; the same id never runs twice. */
  turnId: z.uuid(),
  message: z.string().trim().min(1).max(ADVISOR_LIMITS.message),
  history: z.array(advisorHistorySchema).max(ADVISOR_LIMITS.historyMessages),
  context: advisorContextSchema,
  entry: z.enum(ADVISOR_ENTRIES).nullable(),
});
export type AdvisorTurnBody = z.infer<typeof advisorTurnBodySchema>;

// ── Cards: the one prepared step, acted on with one tap ──────────────────────────

export const OPEN_TARGETS = [
  'log',
  'weigh',
  'sleep_hours',
  'ask_wake',
  'usage_access',
  'connect',
  'blood_work',
] as const;
export type OpenTarget = (typeof OPEN_TARGETS)[number];

export const advisorCardSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('meal'),
    title: z.string().min(1).max(60),
    mealType: z.enum(MEAL_TYPES),
    items: z
      .array(
        z.object({
          name: z.string().min(1).max(60),
          portion: text(40),
          grams: maybe(2000),
          kcal: amount(3000),
          proteinG: amount(300),
          carbsG: amount(500),
          fatG: amount(300),
        }),
      )
      .min(1)
      .max(12),
  }),
  z.object({ kind: z.literal('water'), ml: z.number().int().min(50).max(2000) }),
  z.object({ kind: z.literal('weight'), kg: z.number().min(25).max(300) }),
  z.object({
    kind: z.literal('exercise'),
    title: z.string().min(1).max(60),
    minutes: z.number().int().min(5).max(120),
    moves: z.array(z.string().min(1).max(60)).min(2).max(4),
    /** When to remind; null = the app picks the next free slot. */
    at: clock.nullable(),
  }),
  z.object({ kind: z.literal('open'), target: z.enum(OPEN_TARGETS) }),
]);
export type AdvisorCard = z.infer<typeof advisorCardSchema>;

// ── What streams back ────────────────────────────────────────────────────────────

export const RED_FLAGS = ['urgent', 'crisis'] as const;
export type RedFlag = (typeof RED_FLAGS)[number];

export const ADVISOR_ERRORS = ['unavailable', 'busy', 'timeout', 'failed'] as const;
export type AdvisorError = (typeof ADVISOR_ERRORS)[number];

export const advisorEventSchema = z.discriminatedUnion('type', [
  /** What is being read right now: "Checking your sleep". */
  z.object({ type: z.literal('status'), label: z.string().max(60) }),
  /** One whole, checked sentence. */
  z.object({ type: z.literal('delta'), text: z.string().min(1).max(ADVISOR_LIMITS.sentence) }),
  z.object({ type: z.literal('card'), card: advisorCardSchema }),
  z.object({
    type: z.literal('done'),
    text: z.string().max(2000),
    cards: z.array(advisorCardSchema).max(1),
    flag: z.enum(RED_FLAGS).nullable(),
  }),
  z.object({ type: z.literal('error'), code: z.enum(ADVISOR_ERRORS) }),
]);
export type AdvisorEvent = z.infer<typeof advisorEventSchema>;

/** The poll view of a turn (and the resume after the app was in the background). */
export const advisorTurnStateSchema = z.object({
  turnId: z.uuid(),
  status: z.enum(['running', 'done', 'failed']),
  text: z.string().max(2000),
  cards: z.array(advisorCardSchema).max(1),
  flag: z.enum(RED_FLAGS).nullable(),
  error: z.enum(ADVISOR_ERRORS).nullable(),
});
export type AdvisorTurnState = z.infer<typeof advisorTurnStateSchema>;

/** One SSE frame for an event. */
export const sseFrame = (event: AdvisorEvent) => `data: ${JSON.stringify(event)}\n\n`;

/**
 * The `data:` payloads of the complete SSE events in `buffer`, and what's left over for the next
 * read. Comment lines (`: ping`, `: keep-alive`) are skipped; multi-line data is joined.
 */
export function sseData(buffer: string): { data: string[]; rest: string } {
  const data: string[] = [];
  const events = buffer.replace(/\r\n?/g, '\n').split('\n\n');
  const rest = events.pop() ?? '';
  for (const event of events) {
    const lines = event
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(l.startsWith('data: ') ? 6 : 5));
    if (lines.length > 0) data.push(lines.join('\n'));
  }
  return { data, rest };
}

// ── Red flags: no advice, a fixed reply, before any model call ───────────────────

const CRISIS: readonly RegExp[] = [
  /\bsuicid\w*/i,
  /\bkill(ing)? myself\b/i,
  /\bend(ing)? (my life|it all)\b/i,
  /\b(want|wanted|going) to die\b/i,
  /\bdon['’]?t want to (live|be alive|wake up)\b/i,
  /\b(better off dead|no reason to live)\b/i,
  /\bself[- ]?harm\w*/i,
  /\b(hurt|hurting|cut|cutting|harm|harming) myself\b/i,
  /\bmake myself (throw up|vomit|sick)\b/i,
  /\bstarv(e|ing) myself\b/i,
];

const URGENT: readonly RegExp[] = [
  /\bchest (pain|pains|tightness|pressure)\b/i,
  /\b(pain|pressure|tightness) in (my|the) chest\b/i,
  /\b(can['’]?t|cannot|can not|struggling to|hard to) breathe\b/i,
  /\b(trouble|difficulty) breathing\b/i,
  /\b(fainted|fainting|passed out|blacked out|lost consciousness)\b/i,
  /\b(face|mouth) (is )?droop\w*/i,
  /\bslurred speech\b/i,
  /\bsudden (numbness|weakness|confusion)\b/i,
  /\bone side of my (face|body) (is |feels |went |goes )?(numb|weak)\b/i,
  /\bthroat (is )?(swelling|closing|swollen)\b/i,
  /\bswollen (throat|tongue)\b/i,
  /\banaphyla\w*/i,
  /\boverdos\w*/i,
  /\btook too many (pills|tablets)\b/i,
  /\bblood in (my )?(urine|pee|stool|stools|poo|vomit|sick)\b/i,
  /\b(vomiting|throwing up|coughing up|coughing) blood\b/i,
  /\b(seizure|seizures|convulsion\w*)\b/i,
  /\b(worst|sudden,? severe) headache\b/i,
];

/** Negated just before the match, in the same clause: "no chest pain", "I don't have chest pain". */
const NEGATED = /\b(no|not|never|without|don['’]?t have|didn['’]?t have|haven['’]?t had|isn['’]?t|wasn['’]?t)\b[^.,;!?]{0,24}$/i;

function flagged(rules: readonly RegExp[], message: string): boolean {
  for (const rule of rules) {
    const global = new RegExp(rule.source, rule.flags.includes('g') ? rule.flags : `${rule.flags}g`);
    for (const m of message.matchAll(global)) {
      if (!NEGATED.test(message.slice(0, m.index))) return true;
    }
  }
  return false;
}

/** Crisis words first (they can sit next to an urgent one), then urgent symptoms, else null. */
export function redFlag(message: string): RedFlag | null {
  if (flagged(CRISIS, message)) return 'crisis';
  if (flagged(URGENT, message)) return 'urgent';
  return null;
}

/** The fixed replies: no advice, one clear next step. */
export const RED_FLAG_REPLY: Record<RedFlag, string> = {
  urgent:
    'This needs a doctor now, not advice here. Call 112 or your local emergency number, or go to the nearest emergency room.',
  crisis:
    'You don’t have to carry this alone. Call Tele-MANAS on 14416, free at any hour, or 112 if you’re in danger right now.',
};

// ── The sentence guard ───────────────────────────────────────────────────────────

/** Naming a condition, or reading one into the user's numbers. */
const DIAGNOSTIC =
  /\b(diagnos\w*|disease\w*|disorder\w*|syndrome\w*|condition\w*|symptom\w*|signs? of|diabet\w*|prediabet\w*|hypertensi\w*|hypotensi\w*|hypo ?thyroid\w*|hyper ?thyroid\w*|an(a)?emi\w*|deficien\w*|insomnia\w*|apn(o)?ea|arrhythmi\w*|obes\w*|fatty liver|cancer\w*|tumou?r\w*|infection\w*|depress\w*|cholesterol(a)?emia|hyperlipid\w*|dyslipid\w*)\b/i;
/** Doses, drugs and supplements; lab units ("mg/dL") are fine. */
const DOSING =
  /\b(dose|doses|dosage\w*|dosing|supplement\w*|tablet\w*|pill|pills|capsule\w*|medicat\w*|medicine\w*|prescri\w*|statin\w*|metformin|insulin|levothyrox\w*|ibuprofen|paracetamol|acetaminophen|aspirin)\b|\d\s?(mg|mcg|µg|iu)\b(?!\s*\/)/i;
/** One goal (the plan): never goals per factor or a list of targets. */
const GOALS = /\b(goals|goal (for|of)|targets? for|set (a|your|some|new) (goal|target))\b/i;
/** The 0-100 scores behind the screens aren't facts to quote. */
const SCORES = /\b\d{1,3}\s?(\/\s?100|out of 100|points?)\b|\barea score\b/i;

/**
 * Makes a sentence fit the voice where it can: plain text (no markdown or bullets), dashes used as
 * pauses become commas, "!" becomes ".", no emoji, single spaces. Number ranges keep their dash.
 */
export function tidySentence(sentence: string): string {
  return sentence
    .replace(/\p{Extended_Pictographic}️?/gu, '')
    .replace(/\*\*|__|`|^#+\s*|^\s*[-*•]\s+|^\s*\d+\.\s+/g, '')
    .replace(/(\d)\s?[-–—]\s?(\d)/g, '$1–$2')
    .replace(/\s*[—–]\s*/g, (m, offset: number, all: string) =>
      /\d/.test(all[offset - 1] ?? '') && /\d/.test(all[offset + m.length] ?? '') ? m : ', ',
    )
    .replace(/\s+-\s+/g, ', ')
    .replace(/;\s*/g, ', ')
    .replace(/!+/g, '.')
    .replace(/,\s*([.?])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Why a tidied reply sentence can't be shown, or null when it can. */
export function advisorProblem(sentence: string): string | null {
  if (!sentence || !/[\p{L}\d]/u.test(sentence)) return 'empty';
  if (sentence.length > ADVISOR_LIMITS.sentence) return 'long';
  if (DIAGNOSTIC.test(sentence)) return 'diagnostic';
  if (DOSING.test(sentence)) return 'dosing';
  if (GOALS.test(sentence)) return 'goals';
  if (SCORES.test(sentence)) return 'score';
  // A number range keeps its en dash ("7–8 h"); every other habit is checked as in the briefs.
  const bare = sentence.replace(/(\d)–(\d)/g, '$1 $2');
  for (const rule of BANNED) if (rule.test(bare)) return `banned ${rule.source}`;
  return null;
}

/** The line sent when nothing in a reply passed the guard. */
export const ADVISOR_FALLBACK = 'Ask that another way and the answer will be shorter.';

/**
 * Checks a reply sentence by sentence as it streams: each is tidied and kept only if it passes the
 * guard, up to three sentences and one question. `push` returns the sentence to show, or null.
 */
export function replyGuard() {
  const kept: string[] = [];
  let questions = 0;
  return {
    push(sentence: string): string | null {
      if (kept.length >= ADVISOR_LIMITS.sentences) return null;
      const tidy = tidySentence(sentence);
      if (advisorProblem(tidy)) return null;
      const question = tidy.endsWith('?');
      if (question && questions >= ADVISOR_LIMITS.questions) return null;
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

// ── Splitting a stream into sentences ────────────────────────────────────────────

const ABBREVIATIONS = new Set(['e.g', 'i.e', 'vs', 'approx', 'dr', 'mr', 'mrs', 'ms', 'a.m', 'p.m']);

/**
 * The whole sentences at the start of `input`, and the unfinished rest. A stop ends a sentence
 * only when whitespace follows (so "6.5" and "mg/dL." mid-stream wait), never after a known
 * abbreviation. With `final`, the rest becomes the last sentence.
 */
export function splitSentences(input: string, final = false): { sentences: string[]; rest: string } {
  const sentences: string[] = [];
  let start = 0;
  for (let i = 0; i < input.length; i++) {
    const c = input[i]!;
    if (c !== '.' && c !== '?' && c !== '!' && c !== '\n') continue;
    // Closing quotes or brackets stay with their sentence.
    let end = i + 1;
    while (end < input.length && /["'”’)\]]/.test(input[end]!)) end++;
    const next = input[end];
    if (c !== '\n' && next !== undefined && !/\s/.test(next)) continue;
    if (c !== '\n' && next === undefined && !final) break;
    if (c === '.') {
      const word = /([\p{L}.]+)\.$/u.exec(input.slice(start, i + 1))?.[1]?.toLowerCase();
      if (word && ABBREVIATIONS.has(word)) continue;
    }
    const sentence = input.slice(start, end).trim();
    if (sentence) sentences.push(sentence);
    start = end;
    i = end - 1;
  }
  let rest = input.slice(start);
  if (final) {
    if (rest.trim()) sentences.push(rest.trim());
    rest = '';
  }
  return { sentences, rest: rest.replace(/^\s+/, '') };
}

// ── History ──────────────────────────────────────────────────────────────────────

/** Rough tokens for English text (≈4 characters each). */
export const approxTokens = (s: string) => Math.ceil(s.length / 4);

/** The newest messages that fit the budget, oldest first, never starting with a reply. */
export function trimHistory(
  history: readonly AdvisorHistoryItem[],
  max: number = ADVISOR_LIMITS.historyMessages,
  tokens: number = ADVISOR_LIMITS.historyTokens,
): AdvisorHistoryItem[] {
  const kept: AdvisorHistoryItem[] = [];
  let used = 0;
  for (let i = history.length - 1; i >= 0 && kept.length < max; i--) {
    const item = history[i]!;
    const content = item.content.slice(0, ADVISOR_LIMITS.historyMessage);
    used += approxTokens(content);
    if (used > tokens) break;
    kept.unshift({ role: item.role, content });
  }
  while (kept[0]?.role === 'assistant') kept.shift();
  return kept;
}

// ── The one starter the screen offers, from today's brief ──────────────────────

const STARTERS: Partial<Record<InsightKind, string>> = {
  protein_pace: 'How do I close the protein gap today?',
  calorie_pace: 'Am I eating enough today?',
  calorie_over: 'What helps after a big day of eating?',
  water_pace: 'How much water is left today?',
  weigh_in: 'How is my weight trend going?',
  sleep_debt: 'How do I catch up on sleep?',
  bedtime: 'How do I sleep better tonight?',
  sleep_pattern: 'How do I sleep better tonight?',
  weekly_review: 'How did this week go?',
  quiet_days: 'Where do I pick up from?',
  blood_work: 'What does my blood work say?',
};
const MEAL_STARTER: Record<string, string> = {
  breakfast: 'What makes a good breakfast for me?',
  lunch: 'What makes a good lunch for me?',
  dinner: 'What makes a good dinner for me?',
  snack: 'What makes a good snack for me?',
};
const DEFAULT_STARTER = 'What matters most today?';

/** One question to start with, about what today's brief is about. */
export function starterQuestion(brief: { type: InsightKind; facts: InsightFacts } | null): string {
  if (!brief) return DEFAULT_STARTER;
  if (brief.type === 'meal_window') return MEAL_STARTER[String(brief.facts.meal)] ?? DEFAULT_STARTER;
  if (brief.type === 'vital_alert') return `What does my ${String(brief.facts.label).toLowerCase()} reading mean?`;
  return STARTERS[brief.type] ?? DEFAULT_STARTER;
}

// ── The question an entry point brings ──────────────────────────────────────────

const AREA_CARE: Record<Exclude<AreaKey, 'blood'>, string> = {
  sleep: 'Why does my sleep need care?',
  heart: 'Why does my heart need care?',
  movement: 'Why does my movement need care?',
  screen: 'Why do my evenings need care?',
  body: 'Why does my weight trend need care?',
};
const AREA_MORE: Record<Exclude<AreaKey, 'blood'>, string> = {
  sleep: 'What would help my sleep most?',
  heart: 'What would help my heart most?',
  movement: 'What would help my movement most?',
  screen: 'What would help my evenings most?',
  body: 'What would help my weight trend most?',
};
const STEADY = 'What keeps my vitals steady?';

/**
 * The question the Vitals pill pre-fills: about what the hero leads with (the area that needs care
 * or has the most room), else the blood factor that speaks first, else keeping things steady.
 * Plus brings no question of its own.
 */
export function entryQuestion(
  entry: AdvisorEntry | null,
  areas: readonly Area[],
  factors: readonly Factor[],
  goal: 'lose' | 'maintain' | 'gain' | null | undefined,
): string | null {
  if (entry !== 'vitals') return null;
  const focus = vitalsHeadline(areas).focus;
  if (focus && focus !== 'blood') {
    const area = areas.find((a) => a.key === focus);
    return area?.state === 'needs_care' ? AREA_CARE[focus] : AREA_MORE[focus];
  }
  const factor = leadFactor(factors, goal);
  if (factor) {
    return factor.lead.far
      ? `What should I do about my ${factor.lead.label} result?`
      : `How do I bring ${factor.lead.label} back into range?`;
  }
  return STEADY;
}
