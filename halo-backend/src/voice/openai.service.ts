import { Inject, Injectable, Logger } from '@nestjs/common';

import { ENV, type Env } from '../config.js';
import { VOICE_LIMITS } from '../shared/index.js';

/** Speech couldn't be turned into words or back (not configured, down, timed out). */
export class SpeechUnavailableError extends Error {
  constructor(readonly reason: string) {
    super(`Speech unavailable: ${reason}`);
  }
}

/**
 * Halo's own screens and food words an Indian English speaker names often, so the transcript spells
 * them right ("open the logger" was heard as "locker" without it). Kept short: on a near-silent
 * clip the model can return the prompt itself, which `echoesPrompt` catches.
 */
export const VOCABULARY = 'Halo, logger, Advisor, weigh-in, roti, dal, paneer, sabzi, idli, dosa, poha, curd.';

const words = (s: string) => s.toLowerCase().match(/[\p{L}-]+/gu) ?? [];
const VOCABULARY_WORDS = new Set(words(VOCABULARY));

/** A transcript that is mostly the vocabulary prompt: nothing was really said. */
export function echoesPrompt(heard: string): boolean {
  const said = words(heard);
  const hits = said.filter((w) => VOCABULARY_WORDS.has(w)).length;
  return hits >= 4 && hits / said.length >= 0.4;
}

/** How the reply sounds: calm and unhurried, never upbeat. */
const DELIVERY =
  'Calm, warm and unhurried. Low energy, steady pace, like a trusted personal assistant speaking quietly. No excitement, no sing-song.';

/**
 * OpenAI's audio endpoints for the overlay's voice: speech to text and text to speech. The audio is
 * passed through and never stored or logged; only status codes and timings are.
 */
@Injectable()
export class OpenAiService {
  private readonly logger = new Logger(OpenAiService.name);

  constructor(@Inject(ENV) private readonly env: Env) {}

  get configured() {
    return !!this.env.OPENAI_API_KEY;
  }

  private headers() {
    return { authorization: `Bearer ${this.env.OPENAI_API_KEY}` };
  }

  /** What was said in a WAV recording (trimmed; empty when nothing was). */
  async transcribe(wav: Buffer, signal?: AbortSignal): Promise<string> {
    if (!this.configured) throw new SpeechUnavailableError('not_configured');
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'voice.wav');
    form.append('model', this.env.OPENAI_STT_MODEL);
    form.append('prompt', VOCABULARY);
    form.append('response_format', 'json');
    const started = Date.now();
    let response: Response;
    try {
      response = await fetch(`${this.env.OPENAI_BASE_URL}/audio/transcriptions`, {
        method: 'POST',
        headers: this.headers(),
        body: form,
        signal: AbortSignal.any([AbortSignal.timeout(10_000), ...(signal ? [signal] : [])]),
      });
    } catch (error) {
      throw new SpeechUnavailableError((error as Error)?.name === 'TimeoutError' ? 'timeout' : 'network');
    }
    if (!response.ok) {
      this.logger.warn(`Transcription failed: http_${response.status} after ${Date.now() - started} ms`);
      throw new SpeechUnavailableError(`http_${response.status}`);
    }
    const body = (await response.json()) as { text?: string };
    return (body.text ?? '').trim().slice(0, VOICE_LIMITS.heard);
  }

  /** The reply read aloud as raw 24 kHz 16-bit mono PCM, streamed as it is made. */
  async speech(text: string, signal?: AbortSignal): Promise<ReadableStream<Uint8Array>> {
    if (!this.configured) throw new SpeechUnavailableError('not_configured');
    let response: Response;
    try {
      response = await fetch(`${this.env.OPENAI_BASE_URL}/audio/speech`, {
        method: 'POST',
        headers: { ...this.headers(), 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.env.OPENAI_TTS_MODEL,
          voice: this.env.OPENAI_TTS_VOICE,
          input: text,
          instructions: DELIVERY,
          response_format: 'pcm',
        }),
        signal: AbortSignal.any([AbortSignal.timeout(15_000), ...(signal ? [signal] : [])]),
      });
    } catch (error) {
      throw new SpeechUnavailableError((error as Error)?.name === 'TimeoutError' ? 'timeout' : 'network');
    }
    if (!response.ok || !response.body) {
      this.logger.warn(`Speech failed: http_${response.status}`);
      throw new SpeechUnavailableError(`http_${response.status}`);
    }
    return response.body;
  }
}
