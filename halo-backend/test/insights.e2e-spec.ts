import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';

import { AiService, AiUnavailableError } from '../src/ai/ai.service.js';
import { AppModule } from '../src/app.module.js';
import { loadEnv } from '../src/config.js';

// Brief rewording over HTTP with a fake AI: auth, validation, the guard dropping bad items, and
// the 503 the app falls back from.

let mongo: MongoMemoryServer;
let app: INestApplication;

const APP_KEY = 'AbCdEfGh12345678';
const headers = (id: string) => ({ 'x-app-key': APP_KEY, 'x-device-id': id });

const pattern = {
  tagline: 'Protein is behind',
  line: 'About {gap} g short for {at}. Greek yogurt with berries now, and dinner covers the rest.',
  actionLabel: 'Log a protein snack',
};
const item = (key: string) => ({ key, kind: 'protein_pace', tier: 'mid', slot: 'afternoon', goal: 'lose', pattern });

let answer: unknown = { items: [] };
let unavailable = false;
const fakeAi = {
  configured: true,
  json: vi.fn(async () => {
    if (unavailable) throw new AiUnavailableError('timeout');
    return answer;
  }),
};

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  const env = loadEnv({ MONGODB_URI: mongo.getUri('halo-insights-test'), APP_KEY, RATE_LIMIT_PER_MINUTE: '1000' });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(env)] })
    .overrideProvider(AiService)
    .useValue(fakeAi)
    .compile();
  app = moduleRef.createNestApplication();
  await app.init();
}, 120_000);

afterAll(async () => {
  await app?.close();
  await mongo?.stop();
});

const http = () => request(app.getHttpServer());

async function registered() {
  const id = randomUUID();
  await http().post('/device/register').set(headers(id)).send({}).expect(200);
  return id;
}

describe('POST /insights/phrase', () => {
  it('needs the app key and a known device', async () => {
    await http().post('/insights/phrase').send({ items: [item('abcdef1')] }).expect(401);
  });

  it('rejects a bad body', async () => {
    const device = await registered();
    await http().post('/insights/phrase').set(headers(device)).send({ items: [] }).expect(400);
    await http()
      .post('/insights/phrase')
      .set(headers(device))
      .send({ items: [{ ...item('abcdef1'), kind: 'gossip' }] })
      .expect(400);
    const long = { ...pattern, line: 'x'.repeat(200) };
    await http()
      .post('/insights/phrase')
      .set(headers(device))
      .send({ items: [{ ...item('abcdef1'), pattern: long }] })
      .expect(400);
  });

  it('returns faithful rewordings and drops the ones that fail the guard', async () => {
    const device = await registered();
    answer = {
      items: [
        { key: 'good001', tagline: 'Protein is short', line: 'About {gap} g under for {at}. Yogurt now, dinner does the rest.', actionLabel: 'Log a protein snack' },
        { key: 'digits1', tagline: 'Protein is short', line: 'About 25 g under for {at}. Yogurt now.', actionLabel: 'Log a snack' },
        { key: 'aivoice', tagline: 'Let’s fix protein', line: 'About {gap} g under for {at}. Your AI suggests yogurt!', actionLabel: 'Log a snack' },
        { key: 'unasked', tagline: 'Extra', line: '{gap} g by {at}.', actionLabel: 'Log' },
      ],
    };
    const res = await http()
      .post('/insights/phrase')
      .set(headers(device))
      .send({ items: [item('good001'), item('digits1'), item('aivoice'), item('missing')] })
      .expect(200);
    expect(res.body).toEqual({
      items: [
        {
          key: 'good001',
          tagline: 'Protein is short',
          line: 'About {gap} g under for {at}. Yogurt now, dinner does the rest.',
          actionLabel: 'Log a protein snack',
        },
      ],
    });
    // Only the pattern goes to the model: no numbers, no user text.
    const sent = JSON.stringify(fakeAi.json.mock.calls.at(-1));
    expect(sent).not.toMatch(/\b25\b/);
  });

  it('answers 503 when the AI is unavailable', async () => {
    const device = await registered();
    unavailable = true;
    await http().post('/insights/phrase').set(headers(device)).send({ items: [item('abcdef1')] }).expect(503);
    unavailable = false;
  });
});
