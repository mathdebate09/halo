// Reworded briefs (SPEC §5 patterns 1 and 4). The brief's template goes out as a pattern (no
// numbers, nothing the user wrote), the reworded pattern lands in MMKV under a hash of what it
// depends on, and the hero fills it with live numbers. Today never waits: a miss shows the
// template, and new words only appear on the next focus or return to the app, never mid-view.

import { useIsFocused } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import { kv } from '@/lib/kv';
import {
  type Brief,
  type Insight,
  briefPattern,
  fillPattern,
  type Goal,
  type InsightCopy,
  MAX_PHRASE_ITEMS,
  type PhraseItem,
  phraseKey,
  phraseProblem,
  type PhraseResult,
  slotFor,
  type Tier,
} from '@/shared';
import { api, ApiError } from '@/sync/api';

const PREFIX = 'phrase.';
const INDEX_KEY = 'phrase.index';
const MAX_ENTRIES = 60;
const MAX_AGE_MS = 3 * 24 * 60 * 60_000;
const DEBOUNCE_MS = 2_000;
/** After a failure (offline, 503), wait this long before asking again. */
const BACKOFF_MS = 5 * 60_000;

type Cached = InsightCopy & { at: number };

function readIndex(): string[] {
  try {
    return JSON.parse(kv.getString(INDEX_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

/** Cached words for a key, or null (missing or older than three days). */
export function readPhrase(key: string): InsightCopy | null {
  const raw = kv.getString(PREFIX + key);
  if (!raw) return null;
  try {
    const { at, ...copy } = JSON.parse(raw) as Cached;
    return Date.now() - at < MAX_AGE_MS ? copy : null;
  } catch {
    return null;
  }
}

function writePhrase(key: string, copy: InsightCopy) {
  kv.set(PREFIX + key, JSON.stringify({ ...copy, at: Date.now() } satisfies Cached));
  // Newest first; the oldest fall off.
  const index = [key, ...readIndex().filter((k) => k !== key)];
  for (const old of index.slice(MAX_ENTRIES)) kv.remove(PREFIX + old);
  kv.set(INDEX_KEY, JSON.stringify(index.slice(0, MAX_ENTRIES)));
}

/** The phrase request for a brief, or null for on-track days (the tier's lines speak then). */
export function phraseItemFor(
  insight: Insight,
  tier: Tier,
  hour: number,
  goal: Goal,
): PhraseItem | null {
  if (insight.type === 'on_track') return null;
  const base = {
    kind: insight.type,
    tier,
    slot: slotFor(hour),
    goal,
    pattern: briefPattern(insight),
  };
  return { key: phraseKey(base), ...base };
}

/** An insight's words: cached rewording filled with its numbers, else its template. */
export function wordsFor(insight: Insight, key: string | null): InsightCopy {
  const cached = key ? readPhrase(key) : null;
  // Re-checked on every read, so a stricter guard also retires words cached under an older one.
  if (!cached || phraseProblem(briefPattern(insight), cached)) return insight.copy;
  return {
    ...fillPattern(cached, insight.facts),
    // Button labels stay the template's: they name what the button does.
    actionLabel: insight.copy.actionLabel,
  };
}

// One request at a time, batched, debounced; each key asked at most once per app session.
const queue = new Map<string, PhraseItem>();
const asked = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;
let inFlight = false;
let pausedUntil = 0;

/** Asks for words for these briefs in the background, unless they're cached or already asked. */
export function requestPhrases(items: readonly PhraseItem[]) {
  for (const item of items) {
    if (asked.has(item.key) || readPhrase(item.key)) continue;
    queue.set(item.key, item);
  }
  if (!queue.size) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void flush(), DEBOUNCE_MS);
}

async function flush() {
  timer = null;
  if (inFlight || !queue.size) return;
  if (Date.now() < pausedUntil) {
    timer = setTimeout(() => void flush(), pausedUntil - Date.now());
    return;
  }
  const batch = [...queue.values()].slice(0, MAX_PHRASE_ITEMS);
  inFlight = true;
  try {
    const result = await api<PhraseResult>('/insights/phrase', {
      method: 'POST',
      body: { items: batch },
      timeoutMs: 20_000,
    });
    for (const item of batch) {
      queue.delete(item.key);
      asked.add(item.key);
      const words = result.items.find((w) => w.key === item.key);
      if (!words) continue;
      const copy = { tagline: words.tagline, line: words.line, actionLabel: words.actionLabel };
      // The server checks too; this keeps a bad answer out even if the two ever drift.
      if (!phraseProblem(item.pattern, copy)) writePhrase(item.key, copy);
    }
  } catch (error) {
    // 4xx won't get better by asking again; anything else (offline, 503) waits a while.
    if (error instanceof ApiError && error.status < 500 && error.status !== 429) {
      for (const item of batch) {
        queue.delete(item.key);
        asked.add(item.key);
      }
    } else {
      pausedUntil = Date.now() + BACKOFF_MS;
    }
  } finally {
    inFlight = false;
    if (queue.size && !timer) timer = setTimeout(() => void flush(), DEBOUNCE_MS);
  }
}

/**
 * The words to show for a brief: its reworded pattern filled with today's numbers when cached,
 * otherwise the template. Read when the brief changes and when the screen regains focus or the
 * app returns, so words that arrive late never swap under the user's eyes.
 */
export function useBriefWords(brief: Brief, phrase: string | null): InsightCopy {
  const focused = useIsFocused();
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    if (focused) setEpoch((e) => e + 1);
  }, [focused]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setEpoch((e) => e + 1);
    });
    return () => sub.remove();
  }, []);
  // epoch is the re-read trigger.
  // The cached pattern is read only here (epoch is the re-read trigger); numbers fill live.
  const cached = useMemo(() => (phrase ? readPhrase(phrase) : null), [phrase, epoch]);
  const { insight } = brief;
  if (!cached || phraseProblem(briefPattern(insight), cached)) return insight.copy;
  return {
    ...fillPattern(cached, insight.facts),
    // Button labels stay the template's: they name what the button does.
    actionLabel: insight.copy.actionLabel,
  };
}
