import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';

import { AiService, type StreamChunk, type StreamRequest } from '../src/ai/ai.service.js';
import { AppModule } from '../src/app.module.js';
import { loadEnv } from '../src/config.js';
import { type AdvisorContext, RED_FLAG_REPLY, VOICE_LINES, VOICE_LIMITS, type VoiceReply } from '../src/shared/index.js';
import { OpenAiService } from '../src/voice/openai.service.js';

// Voice turns over HTTP with a scripted AI and a fake OpenAI: what was heard, the tool loop that
// acts, the spoken guard, red flags, a stale phone, speech fetched by id, one turn at a time,
// idempotent turn ids, and the failures' lines.

let mongo: MongoMemoryServer;
let app: INestApplication;

const APP_KEY = 'AbCdEfGh12345678';
const headers = (id: string) => ({ 'x-app-key': APP_KEY, 'x-device-id': id });
const DAY = '2026-10-20';

let rounds: StreamChunk[][] = [];
let requests: { messages: StreamRequest['messages']; tools: string[] }[] = [];
const answer = (text: string): StreamChunk[] => [
  { type: 'text', text },
  { type: 'end', finish: 'stop', toolCalls: [] },
];
const toolRound = (filler: string, ...calls: [string, unknown][]): StreamChunk[] => [
  { type: 'text', text: filler },
  {
    type: 'end',
    finish: 'tool_calls',
    toolCalls: calls.map(([name, args], i) => ({ id: `call_${i}`, name, arguments: JSON.stringify(args) })),
  },
];
const fakeAi = {
  configured: true,
  json: vi.fn(),
  stream: vi.fn(async function* (req: StreamRequest): AsyncGenerator<StreamChunk> {
    requests.push({ messages: JSON.parse(JSON.stringify(req.messages)), tools: (req.tools ?? []).map((t) => t.name) });
    for (const chunk of rounds.shift() ?? answer('Fine.')) yield chunk;
  }),
};

let heard = 'had two rotis and dal';
let gate: Promise<void> = Promise.resolve();
const PCM = new Uint8Array([1, 0, 2, 0, 3, 0, 4, 0]);
const fakeOpenAi = {
  configured: true,
  transcribe: vi.fn(async () => {
    await gate;
    return heard;
  }),
  speech: vi.fn(
    async (_text: string) =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(PCM);
          controller.close();
        },
      }),
  ),
};

const context = (): AdvisorContext => ({
  profile: { age: 29, sex: 'male', heightCm: 176, units: 'metric', clock24: true },
  plan: {
    goal: 'lose',
    kcal: 2100,
    kcalFloor: 1500,
    proteinG: 140,
    carbsG: 230,
    fatG: 65,
    waterMl: 2500,
    steps: 8000,
    sleepNeedH: 7.5,
    goalWeightKg: 72,
  },
  today: {
    day: DAY,
    hour: 13.5,
    clock: '13:30',
    scores: { overall: 71, diet: 64, activity: 70, vitals: 76 },
    intake: { kcal: 820, proteinG: 41, carbsG: 96, fatG: 28 },
    expected: { kcal: 1000, proteinG: 66 },
    waterMl: 1250,
    steps: 4310,
    sleep: { hours: 6.4, source: 'Estimated' },
    brief: null,
  },
  vitals: { areas: [], rows: [] },
  blood: null,
  days: [],
  meals: [],
  sessions: [],
  connected: { healthConnect: true, screenTime: true },
});

/** A tiny WAV: the header and a little silence. */
const WAV = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(140)]).toString('base64');

const turn = (over: Record<string, unknown> = {}) => ({
  turnId: randomUUID(),
  threadId: DAY,
  context: context(),
  history: [],
  flag: { id: `${DAY}:water_pace`, title: 'Catch up on water' },
  audio: WAV,
  ...over,
});

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  const env = loadEnv({ MONGODB_URI: mongo.getUri('halo-voice-test'), APP_KEY, RATE_LIMIT_PER_MINUTE: '1000' });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(env)] })
    .overrideProvider(AiService)
    .useValue(fakeAi)
    .overrideProvider(OpenAiService)
    .useValue(fakeOpenAi)
    .compile();
  app = moduleRef.createNestApplication();
  await app.init();
}, 120_000);

afterAll(async () => {
  await app?.close();
  await mongo?.stop();
});

beforeEach(() => {
  rounds = [];
  requests = [];
  heard = 'had two rotis and dal';
  gate = Promise.resolve();
  fakeAi.configured = true;
  fakeOpenAi.configured = true;
  fakeAi.stream.mockClear();
  fakeOpenAi.transcribe.mockClear();
  fakeOpenAi.speech.mockClear();
});

const http = () => request(app.getHttpServer());

async function registered() {
  const id = randomUUID();
  await http().post('/device/register').set(headers(id)).send({}).expect(200);
  return id;
}

const post = (device: string, body: object) => http().post('/voice/turns').set(headers(device)).send(body);

describe('auth and validation', () => {
  it('needs the app key, a turn id and a recording', async () => {
    const device = await registered();
    await http().post('/voice/turns').set({ 'x-device-id': device }).send(turn()).expect(401);
    await post(device, turn({ turnId: 'nope' })).expect(400);
    await post(device, turn({ audio: 'not base64!' })).expect(400);
    // Base64, but not a WAV.
    const res = await post(device, turn({ audio: Buffer.alloc(120).toString('base64') })).expect(400);
    expect(res.body).toEqual({ error: 'failed', line: VOICE_LINES.failed });
  });
});

describe('a voice turn', () => {
  it('logs a meal said aloud at once, holds the filler and says it in a few words', async () => {
    const device = await registered();
    rounds = [
      toolRound("I'll log that for you.", ['log_meal', { description: 'two rotis and dal', title: 'Two rotis and dal' }]),
      answer('Logged two rotis and dal. Tap to see it.'),
    ];
    const res = await post(device, turn()).expect(200);
    const reply = res.body as VoiceReply;
    expect(reply.heard).toBe('had two rotis and dal');
    expect(reply.text).toBe('Logged two rotis and dal.');
    expect(reply.actions).toEqual([
      { kind: 'meal', description: 'two rotis and dal', mealType: null, label: 'Logged two rotis and dal' },
    ]);
    expect(reply.flag).toBeNull();
    expect(reply.speech).toMatchObject({ rate: VOICE_LIMITS.speechRate });
    // The alarm and the snapshot went in as data; the read and act tools were offered.
    const system = requests[0]!.messages[0]!.content as string;
    expect(system).toContain('Catch up on water');
    expect(system).toContain('<data>');
    expect(requests[0]!.tools).toEqual(expect.arrayContaining(['get_today', 'log_meal', 'log_water', 'undo_last', 'open']));
    expect(requests[0]!.tools).not.toContain('propose_meal');
    // The last round answers without tools.
    expect(requests[1]!.messages.at(-1)).toMatchObject({ role: 'tool', content: expect.stringContaining('Logged') });
  });

  it('reads the snapshot to answer a question, and keeps two short sentences', async () => {
    const device = await registered();
    heard = 'how am I doing on protein';
    rounds = [
      toolRound('Checking.', ['get_today', {}]),
      answer('41 of 140 g protein, behind the 66 g expected by now. A dal and paneer lunch closes most of it. Water is fine too.'),
    ];
    const reply = (await post(device, turn()).expect(200)).body as VoiceReply;
    expect(reply.text).toBe('41 of 140 g protein, behind the 66 g expected by now. A dal and paneer lunch closes most of it.');
    expect(reply.actions).toEqual([]);
    expect(JSON.parse(requests[1]!.messages.at(-1)!.content as string)).toMatchObject({ intake: { proteinG: 41 } });
  });

  it('adds water and opens screens, but never offers to set up what is connected', async () => {
    const device = await registered();
    heard = 'add a glass of water and connect health connect';
    rounds = [toolRound('', ['log_water', { ml: 250 }], ['open', { target: 'connect' }], ['open', { target: 'camera' }]), answer('')];
    const reply = (await post(device, turn()).expect(200)).body as VoiceReply;
    expect(reply.actions).toEqual([
      { kind: 'water', ml: 250, label: 'Added 250 ml water' },
      { kind: 'open', target: 'camera' },
    ]);
    // Nothing passed the guard (empty answer): the reply says what was done.
    expect(reply.text).toBe('Added 250 ml water.');
  });

  it('drops a water amount outside the believable range and undoes on request', async () => {
    const device = await registered();
    heard = 'take that back';
    rounds = [toolRound('', ['log_water', { ml: 9000 }], ['undo_last', {}]), answer('Taken back.')];
    const reply = (await post(device, turn()).expect(200)).body as VoiceReply;
    expect(reply.actions).toEqual([{ kind: 'undo', label: 'Taken back' }]);
    expect(reply.text).toBe('Taken back.');
  });

  it('falls back to a plain line when nothing it said may be spoken', async () => {
    const device = await registered();
    rounds = [answer('That sounds like diabetes. Great job!')];
    const reply = (await post(device, turn()).expect(200)).body as VoiceReply;
    expect(reply.text).toBe(VOICE_LINES.fallback);
  });

  it('works from a stale phone with the acting tools only', async () => {
    const device = await registered();
    heard = 'add a glass of water';
    rounds = [toolRound('', ['log_water', { ml: 250 }]), answer('Added 250 ml.')];
    const reply = (await post(device, turn({ context: null, flag: null })).expect(200)).body as VoiceReply;
    expect(reply.actions).toHaveLength(1);
    expect(requests[0]!.tools).not.toContain('get_today');
    expect(requests[0]!.messages[0]!.content).toContain(VOICE_LINES.stale);
  });

  it('answers a red flag with the fixed words and no model call', async () => {
    const device = await registered();
    heard = 'I have crushing chest pain';
    const reply = (await post(device, turn()).expect(200)).body as VoiceReply;
    expect(reply.flag).toBe('urgent');
    expect(reply.text).toBe(RED_FLAG_REPLY.urgent);
    expect(fakeAi.stream).not.toHaveBeenCalled();
  });
});

describe('speech', () => {
  it('streams the reply as PCM for its own device only, with units spelled out', async () => {
    const device = await registered();
    heard = 'add water';
    rounds = [toolRound('', ['log_water', { ml: 250 }]), answer('Added 250 ml.')];
    const reply = (await post(device, turn()).expect(200)).body as VoiceReply;
    const res = await http()
      .get(`/voice/speech/${reply.speech!.id}`)
      .set(headers(device))
      .buffer(true)
      .parse((r, done) => {
        const parts: Buffer[] = [];
        r.on('data', (c: Buffer) => parts.push(c));
        r.on('end', () => done(null, Buffer.concat(parts)));
      })
      .expect(200);
    expect(res.headers['content-type']).toBe('audio/pcm');
    expect(res.headers['x-sample-rate']).toBe(String(VOICE_LIMITS.speechRate));
    expect(new Uint8Array(res.body as Buffer)).toEqual(PCM);
    expect(fakeOpenAi.speech).toHaveBeenCalledWith('Added 250 millilitres.');

    const other = await registered();
    await http().get(`/voice/speech/${reply.speech!.id}`).set(headers(other)).expect(404);
    await http().get('/voice/speech/unknown').set(headers(device)).expect(404);
  });
});

describe('limits and failures', () => {
  it('says so when nothing was said', async () => {
    const device = await registered();
    heard = ' . ';
    const res = await post(device, turn()).expect(422);
    expect(res.body).toEqual({ error: 'no_speech', line: VOICE_LINES.no_speech });
    expect(fakeAi.stream).not.toHaveBeenCalled();
  });

  it('runs one turn per device, and the same turn id gets the same reply', async () => {
    const device = await registered();
    let open = () => {};
    gate = new Promise((resolve) => (open = resolve));
    const first = turn();
    rounds = [answer('Fine.')];
    const pending = post(device, first).then((r) => r);
    await vi.waitFor(() => expect(fakeOpenAi.transcribe).toHaveBeenCalled());
    const busy = await post(device, turn()).expect(429);
    expect(busy.body).toEqual({ error: 'busy', line: VOICE_LINES.busy });
    open();
    const a = (await pending).body as VoiceReply;
    const b = (await post(device, first).expect(200)).body as VoiceReply;
    expect(b).toEqual(a);
    expect(fakeOpenAi.transcribe).toHaveBeenCalledTimes(1);
  });

  it('answers 503 with a line when voice is not configured', async () => {
    const device = await registered();
    fakeOpenAi.configured = false;
    const res = await post(device, turn()).expect(503);
    expect(res.body).toEqual({ error: 'unavailable', line: VOICE_LINES.unavailable });
  });
});
