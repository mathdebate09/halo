import { HttpException, HttpStatus, Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

import { AiService, AiUnavailableError, type ChatMessage, type StreamChunk } from '../ai/ai.service.js';
import { ENV, type Env } from '../config.js';
import {
  ADVISOR_FALLBACK,
  ADVISOR_LIMITS,
  type AdvisorCard,
  type AdvisorEvent,
  type AdvisorTurnBody,
  type AdvisorTurnState,
  RED_FLAG_REPLY,
  redFlag,
  replyGuard,
  splitSentences,
  trimHistory,
} from '../shared/index.js';
import { AdvisorTurn } from './advisor-turn.schema.js';
import { systemPrompt } from './advisor.prompt.js';
import { AdvisorTools, TOOL_SPECS, toolStatus } from './advisor.tools.js';

type Listener = (event: AdvisorEvent) => void;

/**
 * A turn as it runs: the events so far (a late subscriber gets them replayed) and who is listening.
 * The turn keeps running when the stream closes; the poll reads the stored state.
 */
export class LiveTurn {
  private readonly events: AdvisorEvent[] = [];
  private readonly listeners = new Set<Listener>();
  finished = false;

  constructor(readonly turnId: string) {}

  emit(event: AdvisorEvent) {
    if (this.finished) return;
    this.events.push(event);
    if (event.type === 'done' || event.type === 'error') this.finished = true;
    for (const listener of this.listeners) listener(event);
  }

  subscribe(listener: Listener): () => void {
    for (const event of this.events) listener(event);
    if (!this.finished) this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

/** A sentence that points at a card. */
const TAP = /\btap\b/i;

const isDuplicate = (error: unknown) => (error as { code?: number })?.code === 11000;

@Injectable()
export class AdvisorService {
  private readonly logger = new Logger(AdvisorService.name);
  private readonly live = new Map<string, LiveTurn>();

  constructor(
    @InjectModel(AdvisorTurn.name) private readonly turns: Model<AdvisorTurn>,
    private readonly ai: AiService,
    private readonly tools: AdvisorTools,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * Starts a turn, or picks up the one with this id (idempotent). Red flags answer at once with a
   * fixed reply and no model call; otherwise one turn runs per device at a time.
   */
  async begin(deviceId: string, body: AdvisorTurnBody): Promise<LiveTurn> {
    const key = `${deviceId}:${body.turnId}`;
    const running = this.live.get(key);
    if (running) return running;
    const existing = await this.turns.findOne({ deviceId, turnId: body.turnId }).lean();
    if (existing) return this.replay(existing);

    const flag = redFlag(body.message);
    if (!flag) {
      if (!this.ai.configured) throw new ServiceUnavailableException('AI is not configured');
      const busy = await this.turns.exists({
        deviceId,
        status: 'running',
        updatedAt: { $gt: new Date(Date.now() - 2 * this.env.ADVISOR_TURN_MS) },
      });
      if (busy) throw new HttpException('A reply is still on its way', HttpStatus.TOO_MANY_REQUESTS);
    }

    try {
      await this.turns.create({ deviceId, turnId: body.turnId, threadId: body.threadId });
    } catch (error) {
      if (isDuplicate(error)) return this.begin(deviceId, body);
      throw error;
    }
    const turn = new LiveTurn(body.turnId);
    this.live.set(key, turn);
    const finish = () => this.live.delete(key);
    if (flag) {
      void this.redFlagReply(deviceId, turn, flag).finally(finish);
    } else {
      void this.run(deviceId, turn, body)
        .catch((error: unknown) => this.fail(deviceId, turn, error))
        .finally(finish);
    }
    return turn;
  }

  async state(deviceId: string, turnId: string): Promise<AdvisorTurnState | null> {
    const turn = await this.turns.findOne({ deviceId, turnId }).lean();
    if (!turn) return null;
    return { turnId, status: turn.status, text: turn.text, cards: turn.cards, flag: turn.flag, error: turn.error };
  }

  /** A turn that isn't running here any more: its stored ending, once. */
  private async replay(stored: AdvisorTurn & { updatedAt?: Date }): Promise<LiveTurn> {
    const turn = new LiveTurn(stored.turnId);
    if (stored.status === 'running') {
      // Running but not in this process: it was cut off by a restart.
      await this.turns.updateOne({ deviceId: stored.deviceId, turnId: stored.turnId }, { status: 'failed', error: 'failed' });
      turn.emit({ type: 'error', code: 'failed' });
    } else if (stored.status === 'failed') {
      turn.emit({ type: 'error', code: stored.error ?? 'failed' });
    } else {
      turn.emit({ type: 'done', text: stored.text, cards: stored.cards, flag: stored.flag });
    }
    return turn;
  }

  private async redFlagReply(deviceId: string, turn: LiveTurn, flag: 'urgent' | 'crisis') {
    const text = RED_FLAG_REPLY[flag];
    for (const sentence of splitSentences(text, true).sentences) turn.emit({ type: 'delta', text: sentence });
    await this.turns.updateOne({ deviceId, turnId: turn.turnId }, { status: 'done', text, flag });
    turn.emit({ type: 'done', text, cards: [], flag });
  }

  private async fail(deviceId: string, turn: LiveTurn, error: unknown) {
    const code =
      error instanceof AiUnavailableError ? (error.reason === 'timeout' ? 'timeout' : 'unavailable') : 'failed';
    if (!(error instanceof AiUnavailableError)) this.logger.error(`Advisor turn failed: ${(error as Error)?.message}`);
    await this.turns.updateOne({ deviceId, turnId: turn.turnId }, { status: 'failed', error: code }).catch(() => {});
    turn.emit({ type: 'error', code });
  }

  /**
   * The tool loop. Each round streams; its text is held until the finish reason is known, because a
   * round that calls tools opens with filler ("I'll check…"). Only the answering round's sentences
   * are checked and sent. The last round has no tools, so it must answer.
   */
  private async run(deviceId: string, turn: LiveTurn, body: AdvisorTurnBody) {
    const deadline = AbortSignal.timeout(this.env.ADVISOR_TURN_MS);
    const ctx = body.context;
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt(ctx, body.entry) },
      ...trimHistory(body.history).map((h): ChatMessage => ({ role: h.role, content: h.content })),
      { role: 'user', content: body.message },
    ];
    const guard = replyGuard();
    let card: AdvisorCard | null = null;
    const save = (fields: Partial<AdvisorTurn>) => this.turns.updateOne({ deviceId, turnId: turn.turnId }, fields);

    for (let round = 0; round < ADVISOR_LIMITS.toolRounds; round++) {
      const last = round === ADVISOR_LIMITS.toolRounds - 1;
      let text = '';
      let end: Extract<StreamChunk, { type: 'end' }> | null = null;
      for await (const chunk of this.ai.stream({
        messages,
        tools: last ? undefined : TOOL_SPECS,
        maxTokens: 500,
        timeoutMs: 15_000,
        signal: deadline,
      })) {
        if (chunk.type === 'text') text += chunk.text;
        else end = chunk;
      }
      if (!end) break;

      if (end.toolCalls.length > 0 && !last) {
        messages.push({
          role: 'assistant',
          content: null,
          tool_calls: end.toolCalls.map((c) => ({
            id: c.id,
            type: 'function',
            function: { name: c.name, arguments: c.arguments || '{}' },
          })),
        });
        const labels = new Set<string>();
        for (const call of end.toolCalls) {
          const label = toolStatus(call);
          if (label && !labels.has(label)) {
            labels.add(label);
            turn.emit({ type: 'status', label });
          }
          const outcome = await this.tools.run(call, ctx, card != null);
          if (outcome.card && !card) card = outcome.card;
          messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(outcome.result) });
        }
        continue;
      }

      // The answer. A cut-off answer keeps its whole sentences only, and "Tap to…" needs a card.
      for (const sentence of splitSentences(text, end.finish !== 'length').sentences) {
        if (!card && TAP.test(sentence)) continue;
        const kept = guard.push(sentence);
        if (!kept) continue;
        turn.emit({ type: 'delta', text: kept });
        await save({ text: guard.text });
      }
      break;
    }

    if (guard.count === 0) {
      guard.push(ADVISOR_FALLBACK);
      turn.emit({ type: 'delta', text: ADVISOR_FALLBACK });
    }
    const cards = card ? [card] : [];
    if (card) turn.emit({ type: 'card', card });
    await save({ status: 'done', text: guard.text, cards });
    turn.emit({ type: 'done', text: guard.text, cards, flag: null });
  }
}
