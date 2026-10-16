// One Advisor turn over the network (SPEC §5 pattern 3): SSE through expo/fetch, whose body can be
// read as it arrives. If streaming isn't possible or the stream breaks, the same turn id is posted
// without SSE (the server runs a turn id once, so this picks the running turn up) and polled.

import { fetch as streamingFetch } from 'expo/fetch';

import { kv } from '@/lib/kv';
import {
  type AdvisorCard,
  type AdvisorError,
  advisorEventSchema,
  type AdvisorTurnBody,
  type AdvisorTurnState,
  type RedFlag,
  splitSentences,
  sseData,
} from '@/shared';
import { API_URL, ApiError, api, apiHeaders } from '@/sync/api';

/** Dev screen: skip SSE and poll, to check the fallback. */
export const POLL_ONLY_KEY = 'dev.advisorPollOnly';

export type TurnResult = { text: string; cards: AdvisorCard[]; flag: RedFlag | null };
export type TurnCallbacks = {
  onStatus: (label: string) => void;
  onSentence: (sentence: string) => void;
  onCard: (card: AdvisorCard) => void;
};

/** A turn that won't produce a reply: busy (another turn), unavailable, timeout, or failed. */
export class TurnError extends Error {
  constructor(readonly code: AdvisorError) {
    super(`advisor turn: ${code}`);
  }
}

const STREAM_TIMEOUT_MS = 45_000;
const POLL_FOR_MS = 60_000;

const codeFor = (status: number): AdvisorError =>
  status === 429 ? 'busy' : status === 503 ? 'unavailable' : 'failed';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runTurn(body: AdvisorTurnBody, cb: TurnCallbacks): Promise<TurnResult> {
  // Sentences already shown, so the poll only adds the new ones.
  const shown: string[] = [];
  const sentence = (text: string) => {
    shown.push(text);
    cb.onSentence(text);
  };
  if (!kv.getBoolean(POLL_ONLY_KEY)) {
    try {
      return await streamTurn(body, cb, sentence);
    } catch (error) {
      if (error instanceof TurnError) throw error;
      // Streaming unsupported or cut off: the turn goes on on the server; poll it.
    }
  }
  try {
    await api(`/advisor/turns`, { method: 'POST', body });
  } catch (error) {
    if (error instanceof ApiError) throw new TurnError(codeFor(error.status));
    throw new TurnError('unavailable');
  }
  return pollTurn(body.turnId, cb, shown, sentence);
}

async function streamTurn(
  body: AdvisorTurnBody,
  cb: TurnCallbacks,
  sentence: (text: string) => void,
): Promise<TurnResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);
  try {
    const res = await streamingFetch(`${API_URL}/advisor/turns`, {
      method: 'POST',
      headers: { ...apiHeaders(), accept: 'text/event-stream' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) throw new TurnError(codeFor(res.status));
    if (!res.body) throw new Error('no stream');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { data, rest } = sseData(buffer);
      buffer = rest;
      for (const payload of data) {
        const parsed = advisorEventSchema.safeParse(JSON.parse(payload));
        if (!parsed.success) continue;
        const event = parsed.data;
        if (event.type === 'status') cb.onStatus(event.label);
        else if (event.type === 'delta') sentence(event.text);
        else if (event.type === 'card') cb.onCard(event.card);
        else if (event.type === 'error') throw new TurnError(event.code);
        else return { text: event.text, cards: event.cards, flag: event.flag };
      }
    }
    throw new Error('stream ended early');
  } finally {
    clearTimeout(timer);
  }
}

/** Polls the turn (1 s, then ×1.5 up to 5 s), passing on sentences as the stored text grows. */
export async function pollTurn(
  turnId: string,
  cb: Pick<TurnCallbacks, 'onSentence'>,
  shown: string[] = [],
  sentence: (text: string) => void = (t) => {
    shown.push(t);
    cb.onSentence(t);
  },
): Promise<TurnResult> {
  const until = Date.now() + POLL_FOR_MS;
  let delay = 1000;
  while (Date.now() < until) {
    let state: AdvisorTurnState;
    try {
      state = await api<AdvisorTurnState>(`/advisor/turns/${turnId}`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) throw new TurnError('failed');
      state = { turnId, status: 'running', text: '', cards: [], flag: null, error: null };
    }
    const finished = state.status !== 'running';
    const all = splitSentences(state.text, finished).sentences;
    for (const s of all.slice(shown.length)) sentence(s);
    if (state.status === 'done') return { text: state.text, cards: state.cards, flag: state.flag };
    if (state.status === 'failed') throw new TurnError(state.error ?? 'failed');
    await wait(delay);
    delay = Math.min(delay * 1.5, 5000);
  }
  throw new TurnError('timeout');
}
