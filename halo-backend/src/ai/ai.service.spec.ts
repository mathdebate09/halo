import { z } from 'zod';

import { loadEnv } from '../config.js';
import { AiService, AiUnavailableError } from './ai.service.js';

const env = (key?: string) =>
  loadEnv({
    MONGODB_URI: 'mongodb://unused',
    APP_KEY: 'AbCdEfGh12345678',
    ...(key ? { DEEPSEEK_API_KEY: key } : {}),
  });

const schema = z.object({ ok: z.boolean() });
const request = { messages: [{ role: 'user' as const, content: 'json please' }], schema, maxTokens: 50 };

const reply = (content: string | null, status = 200) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status });

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

  it('does not retry a 4xx', async () => {
    fetchMock.mockResolvedValueOnce(reply(null, 401));
    await expect(new AiService(env('k')).json(request)).rejects.toBeInstanceOf(AiUnavailableError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
