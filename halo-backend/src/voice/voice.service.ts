import { randomUUID } from 'node:crypto';

import { HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';

import { AiService, AiUnavailableError, type ChatMessage, type StreamChunk } from '../ai/ai.service.js';
import { ENV, type Env } from '../config.js';
import {
  RED_FLAG_REPLY,
  redFlag,
  splitSentences,
  spokenText,
  VOICE_LIMITS,
  VOICE_LINES,
  type VoiceAction,
  type VoiceError,
  voiceGuard,
  type VoiceReply,
  type VoiceTurnRequest,
} from '../shared/index.js';
import { echoesPrompt, OpenAiService, SpeechUnavailableError } from './openai.service.js';
import { voicePrompt } from './voice.prompt.js';
import { VoiceTools, voiceToolSpecs } from './voice.tools.js';

/** A failed turn: the status, and the line the ring shows (never spoken). */
const failure = (status: HttpStatus, error: VoiceError) => new HttpException({ error, line: VOICE_LINES[error] }, status);

/** A sentence that says something was logged or taken back, or that a screen is opening. */
const CLAIM = /\b(logged|added|saved|taken back|removed)\b/i;
const OPENING = /\bopening\b/i;

/** Claims an action this turn didn't take. */
const unbacked = (text: string, actions: VoiceAction[]) =>
  (CLAIM.test(text) && !actions.some((a) => a.kind !== 'open')) ||
  (OPENING.test(text) && !actions.some((a) => a.kind === 'open'));

/** Said when the model claimed a log without making it (it copied an earlier reply in the thread). */
const NUDGE =
  'Nothing has been logged, taken back or opened in this turn. If the person asked for one, call the tool now; otherwise answer without saying it was done.';

/** The words a reply says when nothing it wrote passed the guard but it did act. */
function saidForActions(actions: VoiceAction[]): string | null {
  const labels = actions.flatMap((a) => (a.kind === 'open' ? [] : [a.label]));
  if (labels.length) return `${labels.join('. ')}.`;
  return actions.length ? 'Opening it.' : null;
}

/**
 * A voice turn from the overlay: speech to text, the Advisor's snapshot tools plus tools that act,
 * one guarded line, and that same line read aloud on request. Nothing is stored: not the audio, not
 * the words. In memory only: the turn's reply (so a retried turn id gets the same answer) and the
 * text to speak, both for VOICE_LIMITS.speechMs.
 */
@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);
  private readonly running = new Set<string>();
  private readonly replies = new Map<string, { at: number; reply: Promise<VoiceReply> }>();
  private readonly speeches = new Map<string, { deviceId: string; text: string; at: number }>();

  constructor(
    private readonly openai: OpenAiService,
    private readonly ai: AiService,
    private readonly tools: VoiceTools,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Runs a turn, or returns the one with this id. One turn per device at a time. */
  turn(deviceId: string, req: VoiceTurnRequest): Promise<VoiceReply> {
    this.sweep();
    const key = `${deviceId}:${req.turnId}`;
    const known = this.replies.get(key);
    if (known) return known.reply;
    if (!this.openai.configured) throw failure(HttpStatus.SERVICE_UNAVAILABLE, 'unavailable');
    if (this.running.has(deviceId)) throw failure(HttpStatus.TOO_MANY_REQUESTS, 'busy');
    const wav = Buffer.from(req.audio, 'base64');
    if (wav.length > VOICE_LIMITS.audioBytes) throw failure(HttpStatus.PAYLOAD_TOO_LARGE, 'too_long');
    if (wav.subarray(0, 4).toString('latin1') !== 'RIFF') throw failure(HttpStatus.BAD_REQUEST, 'failed');

    this.running.add(deviceId);
    const reply = this.run(deviceId, req, wav).finally(() => this.running.delete(deviceId));
    this.replies.set(key, { at: Date.now(), reply });
    // A failed turn may be tried again with the same id.
    reply.catch(() => this.replies.delete(key));
    return reply;
  }

  /** The reply's words as speech, or null when unknown, expired or another device's. */
  async speech(deviceId: string, id: string): Promise<ReadableStream<Uint8Array> | null> {
    this.sweep();
    const entry = this.speeches.get(id);
    if (!entry || entry.deviceId !== deviceId) return null;
    try {
      return await this.openai.speech(entry.text);
    } catch (error) {
      throw this.mapError(error);
    }
  }

  private sweep() {
    const cutoff = Date.now() - VOICE_LIMITS.speechMs;
    for (const [key, r] of this.replies) if (r.at < cutoff) this.replies.delete(key);
    for (const [key, s] of this.speeches) if (s.at < cutoff) this.speeches.delete(key);
  }

  private mapError(error: unknown): HttpException {
    if (error instanceof HttpException) return error;
    if (error instanceof SpeechUnavailableError || error instanceof AiUnavailableError) {
      return error.reason === 'timeout'
        ? failure(HttpStatus.GATEWAY_TIMEOUT, 'timeout')
        : failure(HttpStatus.SERVICE_UNAVAILABLE, 'unavailable');
    }
    this.logger.error(`Voice turn failed: ${(error as Error)?.message}`);
    return failure(HttpStatus.INTERNAL_SERVER_ERROR, 'failed');
  }

  private async run(deviceId: string, req: VoiceTurnRequest, wav: Buffer): Promise<VoiceReply> {
    try {
      const deadline = AbortSignal.timeout(this.env.VOICE_TURN_MS);
      const heard = await this.openai.transcribe(wav, deadline);
      if (!/[\p{L}\d]/u.test(heard) || echoesPrompt(heard)) throw failure(HttpStatus.UNPROCESSABLE_ENTITY, 'no_speech');

      const flag = redFlag(heard);
      let text: string;
      let actions: VoiceAction[] = [];
      if (flag) {
        // Fixed words, no model call.
        text = RED_FLAG_REPLY[flag];
      } else {
        if (!this.ai.configured) throw failure(HttpStatus.SERVICE_UNAVAILABLE, 'unavailable');
        ({ text, actions } = await this.think(req, heard, deadline));
      }
      const id = randomUUID();
      this.speeches.set(id, { deviceId, text: spokenText(text), at: Date.now() });
      return { turnId: req.turnId, heard, text, actions, speech: { id, rate: VOICE_LIMITS.speechRate }, flag };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * The tool loop, as in the Advisor: a round's text is held until its finish (tool rounds open with
   * filler), the last round has no tools, and only the answer is checked, sentence by sentence.
   */
  private async think(req: VoiceTurnRequest, heard: string, deadline: AbortSignal) {
    const ctx = req.context;
    const messages: ChatMessage[] = [
      { role: 'system', content: voicePrompt(ctx, req.flag) },
      // The last exchange only: enough for "and one more", too little to make an old log look done.
      ...req.history.slice(-2).map((h): ChatMessage => ({ role: h.role, content: h.content })),
      { role: 'user', content: heard },
    ];
    const tools = voiceToolSpecs(ctx);
    const guard = voiceGuard();
    const actions: VoiceAction[] = [];
    let nudged = false;

    for (let round = 0; round < VOICE_LIMITS.toolRounds; round++) {
      const last = round === VOICE_LIMITS.toolRounds - 1;
      let text = '';
      let end: Extract<StreamChunk, { type: 'end' }> | null = null;
      for await (const chunk of this.ai.stream({
        messages,
        tools: last ? undefined : tools,
        maxTokens: 300,
        timeoutMs: 10_000,
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
        for (const call of end.toolCalls) {
          let outcome = await this.tools.run(call, ctx);
          if (outcome.action && actions.length >= VOICE_LIMITS.actions) {
            outcome = { result: { error: 'Enough was done in one go; nothing more.' } };
          } else if (outcome.action?.kind === 'open' && actions.some((a) => a.kind === 'open')) {
            // One screen comes forward; a second would cover it.
            outcome = { result: { error: 'One screen is already opening.' } };
          }
          if (outcome.action) actions.push(outcome.action);
          messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(outcome.result) });
        }
        continue;
      }

      // A reply never claims what didn't happen (a log, an Undo, a screen): one nudge to do it, else
      // the claim is dropped.
      if (unbacked(text, actions) && !last && !nudged) {
        nudged = true;
        messages.push({ role: 'assistant', content: text }, { role: 'system', content: NUDGE });
        continue;
      }
      // A cut-off answer keeps its whole sentences only.
      for (const sentence of splitSentences(text, end.finish !== 'length').sentences) {
        if (unbacked(sentence, actions)) continue;
        guard.push(sentence);
      }
      break;
    }

    const text = guard.count > 0 ? guard.text : (saidForActions(actions) ?? VOICE_LINES.fallback);
    return { text, actions };
  }
}
