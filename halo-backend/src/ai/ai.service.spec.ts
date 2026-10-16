import { z } from 'zod';

import { loadEnv } from '../config.js';
import { AiService, AiTruncatedError, AiUnavailableError } from './ai.service.js';

const env = (key?: string) =>
  loadEnv({
    MONGODB_URI: 'mongodb://unused',
    APP_KEY: 'AbCdEfGh12345678',
    ...(key ? { DEEPSEEK_API_KEY: key } : {}),
  });

const schema = z.object({ ok: z.boolean() });
const request = { messages: [{ role: 'user' as const, content: 'json please' }], schema, maxTokens: 50 };

const reply = (content: string | null, status = 200, finish = 'stop') =>
  new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: finish }] }), { status });

describe('AiService', () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('is unavailable without a key, without calling out', async () => {
    await expect(new AiService(env()).json(request)).rejects.toBeInstanceOf(AiUnavailableError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends JSON mode and returns the validated answer', async () => {
    fetchMock.mockResolvedValueOnce(reply('{"ok":true}'));
    await expect(new AiService(env('k')).json(request)).resolves.toEqual({ ok: true });
    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
    expect(body).toMatchObject({
      model: 'deepseek-flash',
      response_format: { type: 'json_object' },
      reasoning_effort: 'none',
      max_tokens: 50,
    });
  });

  it('retries once on a 5xx, empty content or an invalid shape', async () => {
    fetchMock.mockResolvedValueOnce(reply(null, 503)).mockResolvedValueOnce(reply('{"ok":true}'));
    await expect(new AiService(env('k')).json(request)).resolves.toEqual({ ok: true });

    fetchMock.mockResolvedValueOnce(reply('')).mockResolvedValueOnce(reply('{"ok":"yes"}'));
    await expect(new AiService(env('k')).json(request)).rejects.toBeInstanceOf(AiUnavailableError);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('reports a cut-off answer at once, without retrying', async () => {
    fetchMock.mockResolvedValueOnce(reply('{"ok":tr', 200, 'length'));
    await expect(new AiService(env('k')).json(request)).rejects.toBeInstanceOf(AiTruncatedError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry a 4xx', async () => {
    fetchMock.mockResolvedValueOnce(reply(null, 401));
    await expect(new AiService(env('k')).json(request)).rejects.toBeInstanceOf(AiUnavailableError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('AiService.stream', () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const frame = (delta: object, finish: string | null = null) =>
    `data: ${JSON.stringify({ choices: [{ delta, finish_reason: finish }] })}\n\n`;

  /** An SSE body cut into awkward pieces, as the network delivers it. */
  const sse = (text: string, size = 7) =>
    new Response(
      new ReadableStream({
        start(controller) {
          for (let i = 0; i < text.length; i += size) controller.enqueue(new TextEncoder().encode(text.slice(i, i + size)));
          controller.close();
        },
      }),
      { status: 200, headers: { 'content-type': 'text/event-stream' } },
    );

  const collect = async (gen: AsyncGenerator<unknown>) => {
    const out: unknown[] = [];
    for await (const chunk of gen) out.push(chunk);
    return out;
  };

  const streamRequest = { messages: [{ role: 'user' as const, content: 'hi' }], maxTokens: 100 };

  it('streams text and assembles tool calls from fragments', async () => {
    fetchMock.mockResolvedValueOnce(
      sse(
        ': keep-alive\n\n' +
          frame({ content: "I'll check." }) +
          frame({ tool_calls: [{ index: 0, id: 'call_0', type: 'function', function: { name: 'get_vitals', arguments: '' } }] }) +
          frame({ tool_calls: [{ index: 0, function: { arguments: '{}' } }] }) +
          frame({ tool_calls: [{ index: 1, id: 'call_1', type: 'function', function: { name: 'get_trend', arguments: '{"met' } }] }) +
          frame({ tool_calls: [{ index: 1, function: { arguments: 'ric":"steps","days":7}' } }] }, 'tool_calls') +
          'data: [DONE]\n\n',
      ),
    );
    const out = await collect(
      new AiService(env('k')).stream({ ...streamRequest, tools: [{ name: 'get_vitals', description: '', parameters: {} }] }),
    );
    expect(out).toEqual([
      { type: 'text', text: "I'll check." },
      {
        type: 'end',
        finish: 'tool_calls',
        toolCalls: [
          { id: 'call_0', name: 'get_vitals', arguments: '{}' },
          { id: 'call_1', name: 'get_trend', arguments: '{"metric":"steps","days":7}' },
        ],
      },
    ]);
    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
    expect(body).toMatchObject({ stream: true, reasoning_effort: 'none', tools: [{ type: 'function', function: { name: 'get_vitals' } }] });
  });

  it('retries once before the first byte, not after', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(sse(frame({ content: 'Fine.' }, 'stop')));
    const out = await collect(new AiService(env('k')).stream(streamRequest));
    expect(out.at(-1)).toEqual({ type: 'end', finish: 'stop', toolCalls: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(frame({ content: 'Half' })));
            controller.error(new Error('reset'));
          },
        }),
        { status: 200 },
      ),
    );
    await expect(collect(new AiService(env('k')).stream(streamRequest))).rejects.toBeInstanceOf(AiUnavailableError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('is unavailable without a key and does not retry a 4xx', async () => {
    await expect(collect(new AiService(env()).stream(streamRequest))).rejects.toBeInstanceOf(AiUnavailableError);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 400 }));
    await expect(collect(new AiService(env('k')).stream(streamRequest))).rejects.toBeInstanceOf(AiUnavailableError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
