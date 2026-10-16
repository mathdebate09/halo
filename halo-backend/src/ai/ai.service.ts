import { setTimeout as sleep } from 'node:timers/promises';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';

import { ENV, type Env } from '../config.js';
import { sseData } from '../shared/index.js';

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | ContentPart[] }
  | {
      role: 'assistant';
      content: string | null;
      tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
    }
  | { role: 'tool'; tool_call_id: string; content: string };

/** A function the model may call (OpenAI tool format; parameters are a JSON schema). */
export type ToolSpec = { name: string; description: string; parameters: Record<string, unknown> };

/** One assembled tool call: its arguments are the model's JSON text, not yet parsed. */
export type ToolCall = { id: string; name: string; arguments: string };

export type StreamRequest = {
  messages: ChatMessage[];
  tools?: ToolSpec[];
  maxTokens: number;
  /** Per round, including the streamed body. */
  timeoutMs?: number;
  /** Aborts the round (the caller's overall deadline). */
  signal?: AbortSignal;
  temperature?: number;
};

/** Text as it streams, then one `end` with the finish reason and the assembled tool calls. */
export type StreamChunk = { type: 'text'; text: string } | { type: 'end'; finish: string; toolCalls: ToolCall[] };

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

/** The answer hit `maxTokens` and was cut off; the same input would be cut off again. */
export class AiTruncatedError extends AiUnavailableError {
  constructor() {
    super('truncated');
  }
}

type StreamPayload = {
  choices?: {
    delta?: {
      content?: string | null;
      tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[];
    };
    finish_reason?: string | null;
  }[];
};

/** Retries are worth it for these; a 4xx (bad request, auth) would fail the same way again. */
class RetryableError extends Error {}

const ATTEMPTS = 2;

const isTimeout = (error: unknown) =>
  error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');

/**
 * DeepSeek over its OpenAI-compatible chat API: `json()` in JSON mode, `stream()` for a streamed
 * round with tools. Each call has a timeout,
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
        if (error instanceof AiTruncatedError) {
          this.logger.warn(`AI attempt ${attempt} truncated after ${Date.now() - started} ms`);
          throw error;
        }
        last = error instanceof Error ? error.message : 'error';
        const retryable = error instanceof RetryableError || error instanceof SyntaxError;
        this.logger.warn(`AI attempt ${attempt} failed: ${retryable ? last : 'fatal'} after ${Date.now() - started} ms`);
        if (!retryable || attempt === ATTEMPTS) break;
        await sleep(300 + Math.random() * 700);
      }
    }
    throw new AiUnavailableError(last);
  }

  /**
   * One streamed round (SSE) with optional tools, thinking off. A failure before the first byte is
   * retried once; once text is flowing, a failure ends the round with AiUnavailableError. Tool calls
   * arrive as fragments per index and are assembled here.
   */
  async *stream(request: StreamRequest): AsyncGenerator<StreamChunk> {
    if (!this.configured) throw new AiUnavailableError('not_configured');
    const started = Date.now();
    const signal = AbortSignal.any(
      [AbortSignal.timeout(request.timeoutMs ?? this.env.AI_TIMEOUT_MS), request.signal].filter(
        (s): s is AbortSignal => s != null,
      ),
    );
    let response: Response | null = null;
    for (let attempt = 1; attempt <= ATTEMPTS && !response; attempt++) {
      try {
        response = await this.open(request, signal);
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'error';
        const retryable = error instanceof RetryableError && !signal.aborted;
        this.logger.warn(`AI stream attempt ${attempt} failed: ${retryable ? reason : 'fatal'} after ${Date.now() - started} ms`);
        if (!retryable || attempt === ATTEMPTS) throw new AiUnavailableError(signal.aborted ? 'timeout' : reason);
        await sleep(300 + Math.random() * 700);
      }
    }
    const calls: ToolCall[] = [];
    let finish = 'stop';
    let buffer = '';
    const decoder = new TextDecoder();
    const reader = response!.body!.getReader();
    try {
      for (;;) {
        let read: ReadableStreamReadResult<Uint8Array>;
        try {
          read = await reader.read();
        } catch (error) {
          this.logger.warn(`AI stream broke after ${Date.now() - started} ms`);
          throw new AiUnavailableError(isTimeout(error) || signal.aborted ? 'timeout' : 'stream');
        }
        if (read.done) break;
        buffer += decoder.decode(read.value, { stream: true });
        const { data, rest } = sseData(buffer);
        buffer = rest;
        for (const payload of data) {
          if (payload === '[DONE]') continue;
          let chunk: StreamPayload;
          try {
            chunk = JSON.parse(payload) as StreamPayload;
          } catch {
            continue;
          }
          const choice = chunk.choices?.[0];
          if (!choice) continue;
          if (choice.finish_reason) finish = choice.finish_reason;
          if (choice.delta?.content) yield { type: 'text', text: choice.delta.content };
          for (const part of choice.delta?.tool_calls ?? []) {
            const call = (calls[part.index] ??= { id: '', name: '', arguments: '' });
            if (part.id) call.id = part.id;
            if (part.function?.name) call.name += part.function.name;
            if (part.function?.arguments) call.arguments += part.function.arguments;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
    yield { type: 'end', finish, toolCalls: calls.filter((c) => c != null && c.name !== '') };
  }

  private async open({ messages, tools, maxTokens, temperature }: StreamRequest, signal: AbortSignal) {
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
          ...(tools?.length ? { tools: tools.map((t) => ({ type: 'function', function: t })) } : {}),
          stream: true,
          reasoning_effort: 'none',
          max_tokens: maxTokens,
          temperature: temperature ?? 0.3,
        }),
        signal,
      });
    } catch (error) {
      throw new RetryableError(isTimeout(error) ? 'timeout' : 'network');
    }
    if (response.status === 429 || response.status >= 500) throw new RetryableError(`http_${response.status}`);
    if (!response.ok || !response.body) throw new Error(`http_${response.status}`);
    return response;
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
    const body = (await response.json()) as {
      choices?: { message?: { content?: string | null }; finish_reason?: string | null }[];
    };
    if (body.choices?.[0]?.finish_reason === 'length') throw new AiTruncatedError();
    const content = body.choices?.[0]?.message?.content?.trim();
    // DeepSeek's JSON mode can occasionally return empty content.
    if (!content) throw new RetryableError('empty');
    return content;
  }
}
