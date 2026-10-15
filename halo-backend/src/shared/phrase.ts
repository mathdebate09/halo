// GENERATED from halo-shared/src/phrase.ts by halo-shared/scripts/sync.mjs. Do not edit.

// Rewording briefs (SPEC §5 pattern 1, pre-computed). The app sends the brief's template as a
// pattern with `{placeholders}` for every number and time, never the numbers themselves and never
// anything the user wrote. The reworded pattern is checked here (both sides use the same guard),
// cached on the phone by a hash of what it depends on, and filled with the live numbers.
//
//   POST /insights/phrase  { items }  →  { items }   (items that fail the guard are left out)

import { z } from 'zod';

import { placeholders } from './brief-copy.js';
import { INSIGHT_KINDS, type InsightCopy } from './signals.js';

/** Bump when the prompt or the guard changes, so cached wording is asked for again. */
export const PHRASE_VERSION = 3;
export const MAX_PHRASE_ITEMS = 4;
export const PHRASE_LIMITS = { tagline: 32, line: 120, actionLabel: 26 } as const;

export const DAY_SLOTS = ['morning', 'afternoon', 'evening', 'night'] as const;
export type DaySlot = (typeof DAY_SLOTS)[number];

/** Late night (from 22:00 until 05:00) is still the previous day under the 4 am rollover. */
export const slotFor = (hour: number): DaySlot =>
  hour < 5 || hour >= 22 ? 'night' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

const patternText = (max: number) => z.string().min(1).max(max);

export const phrasePatternSchema = z.object({
  tagline: patternText(PHRASE_LIMITS.tagline),
  line: patternText(PHRASE_LIMITS.line),
  actionLabel: patternText(PHRASE_LIMITS.actionLabel).nullable(),
});

export const phraseItemSchema = z.object({
  key: z.string().regex(/^[a-z0-9]{6,32}$/),
  kind: z.enum(INSIGHT_KINDS),
  /** How the day is going: the voice is gentler when it's low. */
  tier: z.enum(['high', 'mid', 'low']),
  slot: z.enum(DAY_SLOTS),
  goal: z.enum(['lose', 'maintain', 'gain']),
  pattern: phrasePatternSchema,
});
export type PhraseItem = z.infer<typeof phraseItemSchema>;

export const phraseBodySchema = z.object({
  items: z.array(phraseItemSchema).min(1).max(MAX_PHRASE_ITEMS),
});
export type PhraseBody = z.infer<typeof phraseBodySchema>;

export const phrasedSchema = phrasePatternSchema.extend({ key: z.string() });
export type Phrased = z.infer<typeof phrasedSchema>;
export type PhraseResult = { items: Phrased[] };

// Words and habits that make copy read machine-written, or that talk about the machine.
const BANNED: readonly RegExp[] = [
  /\bAI\b/,
  /\b(artificial|assistant|algorithm|insight|smart|data|tracking|app)\b/i,
  /\blet['’]s\b/i,
  /\b(great|nice|good) (job|work)\b/i,
  /\bremember to\b/i,
  /\bdon['’]t forget\b/i,
  /\b(it )?(looks|seems) like\b/i,
  /\byou['’]ve got this\b/i,
  /\bkeep up the\b/i,
  /\b(journey|boost|fuel your|crush|unlock|elevate|empower|wellness)\b/i,
  /\b(here['’]s|consider|why not)\b/i,
  /[!;—–]/,
  /\p{Extended_Pictographic}/u,
];

/**
 * Why a reworded pattern can't be used, or null when it can. It must fit the limits, keep
 * the template's placeholders (and add none), carry no digits of its own, keep a question only
 * where the template asked one, and avoid the banned words and habits.
 */
export function phraseProblem(pattern: InsightCopy, out: InsightCopy): string | null {
  const parsed = phrasePatternSchema.safeParse(out);
  if (!parsed.success) return 'shape';
  if ((pattern.actionLabel == null) !== (out.actionLabel == null)) return 'action';
  if (out.tagline === pattern.tagline && out.line === pattern.line) return 'unchanged';
  const texts = [out.tagline, out.line, out.actionLabel ?? ''];
  const allowed = new Set(placeholders(`${pattern.tagline} ${pattern.line} ${pattern.actionLabel ?? ''}`));
  const used = new Set(placeholders(texts.join(' ')));
  for (const p of used) if (!allowed.has(p)) return `placeholder ${p}`;
  for (const p of placeholders(pattern.line)) if (!used.has(p)) return `missing ${p}`;
  const bare = texts.join(' ').replace(/\{\w+\}/g, '');
  if (/\d/.test(bare)) return 'digits';
  if (bare.includes('?') && !`${pattern.tagline}${pattern.line}`.includes('?')) return 'question';
  for (const rule of BANNED) if (rule.test(bare)) return `banned ${rule.source}`;
  return null;
}

/** 53-bit string hash (cyrb53), as base36. */
function hash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36).padStart(6, '0');
}

/**
 * The cache key of a rewording: everything the words depend on (the pattern carries the
 * situation, e.g. which meal and whether protein is folded in), and nothing that only changes a
 * number, so the same situation reuses its words all day.
 */
export const phraseKey = (item: Omit<PhraseItem, 'key'>) =>
  hash(
    [
      PHRASE_VERSION,
      item.kind,
      item.tier,
      item.slot,
      item.goal,
      item.pattern.tagline,
      item.pattern.line,
      item.pattern.actionLabel ?? '',
    ].join('|'),
  );
