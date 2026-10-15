import { setTimeout as sleep } from 'node:timers/promises';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';

import { ENV, type Env } from '../config.js';

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | ContentPart[] };

export type JsonRequest<T extends z.ZodType> = {
  messages: ChatMessage[];
  schema: T;
  maxTokens: number;
  /** Overrides AI_TIMEOUT_MS for this call (per attempt). */
  timeoutMs?: number;
  /** Defaults to 0.2 (estimates); higher where varied wording is the point. */
  temperature?: number;
};

/** The AI couldn't produce a valid answer (not configured, down, timed out or invalid twice). */
export class AiUnavailableError extends Error {
  constructor(readonly reason: string) {
    super(`AI unavailable: ${reason}`);
  }
}

/** Retries are worth it for these; a 4xx (bad request, auth) would fail the same way again. */
class RetryableError extends Error {}

const ATTEMPTS = 2;

/**
 * DeepSeek over its OpenAI-compatible chat API, always in JSON mode. Each call has a timeout,
 * one retry with jitter, and Zod validation of the answer. Health text is never logged: only
 * status codes, reasons and timings.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(@Inject(ENV) private readonly env: Env) {}

  get configured() {
    return !!this.env.DEEPSEEK_API_KEY;
  }

  async json<T extends z.ZodType>(request: JsonRequest<T>): Promise<z.infer<T>> {
    if (!this.configured) throw new AiUnavailableError('not_configured');
    let last = 'unknown';
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      const started = Date.now();
      try {
        const content = await this.complete(request);
        const parsed = request.schema.safeParse(JSON.parse(content));
        if (parsed.success) return parsed.data;
        throw new RetryableError('invalid_json_shape');
      } catch (error) {
        last = error instanceof Error ? error.message : 'error';
        const retryable = error instanceof RetryableError || error instanceof SyntaxError;
        this.logger.warn(`AI attempt ${attempt} failed: ${retryable ? last : 'fatal'} after ${Date.now() - started} ms`);
        if (!retryable || attempt === ATTEMPTS) break;
        await sleep(300 + Math.random() * 700);
      }
    }
    throw new AiUnavailableError(last);
  }

  private async complete({ messages, maxTokens, timeoutMs, temperature }: JsonRequest<z.ZodType>): Promise<string> {
    let response: Response;
    try {
      response = await fetch(`${this.env.DEEPSEEK_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.env.DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: this.env.DEEPSEEK_MODEL,
          messages,
          response_format: { type: 'json_object' },
          // deepseek-flash reasons by default and spends max_tokens on it, leaving empty content.
          // Estimates are as good without it (measured: ~1.3 s vs ~10 s at "low").
          reasoning_effort: 'none',
          max_tokens: maxTokens,
          temperature: temperature ?? 0.2,
        }),
        signal: AbortSignal.timeout(timeoutMs ?? this.env.AI_TIMEOUT_MS),
      });
    } catch (error) {
      // Network failure or timeout.
      throw new RetryableError(error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'network');
    }
    if (response.status === 429 || response.status >= 500) throw new RetryableError(`http_${response.status}`);
    if (!response.ok) throw new Error(`http_${response.status}`);
    const body = (await response.json()) as { choices?: { message?: { content?: string | null } }[] };
    const content = body.choices?.[0]?.message?.content?.trim();
    // DeepSeek's JSON mode can occasionally return empty content.
    if (!content) throw new RetryableError('empty');
    return content;
  }
}
