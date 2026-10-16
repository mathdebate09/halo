// Today's Advisor thread (one per day, `threadId` = day key). The user's message is saved when
// sent; the reply streams into memory and is written once, when it's done, so a streaming reply
// never churns the outbox. A message left "sending" by a restart picks its turn up by polling.

import { and, asc, eq, isNull } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { randomUUID } from 'expo-crypto';
import { useCallback, useEffect, useRef, useState } from 'react';

import { usageAccess } from '@/assistant/screen';
import { db } from '@/db/client';
import { upsertRecord } from '@/db/mutate';
import { advisorMessages } from '@/db/schema';
import { healthConnectState } from '@/lib/health-connect';
import {
  type AdvisorCard,
  type AdvisorEntry,
  type AdvisorError,
  RED_FLAG_REPLY,
  redFlag,
  trimHistory,
} from '@/shared';

import { pollTurn, runTurn, TurnError } from './client';
import { buildAdvisorContext } from './context';
import { readAdvisorSources } from './sources';

export type AdvisorMessage = typeof advisorMessages.$inferSelect;

/** The reply on its way: what the server is reading, and the sentences so far. */
export type LiveReply = {
  turnId: string;
  status: string | null;
  sentences: string[];
  card: AdvisorCard | null;
};

/** Why the last message got no reply, by the user message's id. */
export type Failure = { messageId: string; code: AdvisorError | 'no_plan' };

export function useAdvisorThread(day: string) {
  const { data: messages } = useLiveQuery(
    db
      .select()
      .from(advisorMessages)
      .where(and(eq(advisorMessages.threadId, day), isNull(advisorMessages.deletedAt)))
      .orderBy(asc(advisorMessages.createdAt)),
    [day],
  );
  const [live, setLive] = useState<LiveReply | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const busy = useRef(false);

  /** Runs (or resumes) the turn a saved user message started, and writes the reply. */
  const answer = useCallback(
    async (message: AdvisorMessage, run: (turnId: string) => ReturnType<typeof runTurn>) => {
      const turnId = message.turnId!;
      busy.current = true;
      setFailure(null);
      setLive({ turnId, status: null, sentences: [], card: null });
      try {
        const result = await run(turnId);
        upsertRecord('advisorMessage', {
          threadId: message.threadId,
          role: 'assistant',
          content: result.text,
          status: 'done',
          turnId,
          cards: result.cards,
        });
        upsertRecord('advisorMessage', { ...message, status: 'done' });
      } catch (error) {
        upsertRecord('advisorMessage', { ...message, status: 'failed' });
        setFailure({
          messageId: message.id,
          code: error instanceof TurnError ? error.code : 'failed',
        });
      } finally {
        busy.current = false;
        setLive(null);
      }
    },
    [],
  );

  const send = useCallback(
    async (text: string, entry: AdvisorEntry | null, retryOf?: AdvisorMessage) => {
      const message = text.trim();
      if (!message || busy.current) return;
      const turnId = randomUUID();
      const earlier = messages.filter((m) => m.status === 'done' && m.id !== retryOf?.id);

      // A red flag answers on the phone too, so it works offline and without waiting.
      const flag = redFlag(message);
      const saved = {
        ...(retryOf ?? {}),
        threadId: day,
        role: 'user' as const,
        content: message,
        status: flag ? ('done' as const) : ('sending' as const),
        turnId,
      };
      const id = upsertRecord('advisorMessage', saved);
      if (flag) {
        upsertRecord('advisorMessage', {
          threadId: day,
          role: 'assistant',
          content: RED_FLAG_REPLY[flag],
          status: 'done',
          turnId,
          cards: [],
        });
        return;
      }

      busy.current = true;
      const sources = readAdvisorSources();
      const connected = {
        healthConnect: (await healthConnectState()) === 'connected',
        screenTime: usageAccess() === 'granted',
      };
      const context = sources ? buildAdvisorContext(sources, connected) : null;
      if (!context) {
        busy.current = false;
        upsertRecord('advisorMessage', { ...saved, id, status: 'failed' });
        setFailure({ messageId: id, code: 'no_plan' });
        return;
      }
      // What a tapped card did (water, a meal, a weigh-in) is in the snapshot itself; history is
      // the words only (a note in a reply here gets copied into the next one).
      const history = trimHistory(
        earlier.map((m) => ({ role: m.role, content: m.content.slice(0, 2000) })),
      );
      const row = {
        ...saved,
        id,
        cards: null,
        createdAt: 0,
        updatedAt: 0,
        deletedAt: null,
        syncState: 'pending',
      } as AdvisorMessage;
      void answer(row, (tid) =>
        runTurn(
          { threadId: day, turnId: tid, message, history, context, entry },
          {
            onStatus: (status) => setLive((l) => (l ? { ...l, status } : l)),
            onSentence: (sentence) =>
              setLive((l) =>
                l ? { ...l, status: null, sentences: [...l.sentences, sentence] } : l,
              ),
            onCard: (card) => setLive((l) => (l ? { ...l, card } : l)),
          },
        ),
      );
    },
    [answer, day, messages],
  );

  /** Sends a failed message again as a new turn. */
  const retry = useCallback(
    (message: AdvisorMessage) => void send(message.content, null, message),
    [send],
  );

  // A message still "sending" after a restart: its turn may have finished on the server.
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current || messages.length === 0) return;
    resumed.current = true;
    const last = messages.at(-1)!;
    if (last.role !== 'user' || last.status !== 'sending' || !last.turnId || busy.current) return;
    void answer(last, (tid) =>
      pollTurn(tid, {
        onSentence: (sentence) =>
          setLive((l) => (l ? { ...l, sentences: [...l.sentences, sentence] } : l)),
      }),
    );
  }, [answer, messages]);

  return { messages, live, failure, send, retry, busy: live != null };
}
