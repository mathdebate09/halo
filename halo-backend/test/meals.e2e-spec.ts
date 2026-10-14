import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';

import { AiService, AiUnavailableError } from '../src/ai/ai.service.js';
import { AppModule } from '../src/app.module.js';
import { loadEnv } from '../src/config.js';
import type { MealAnalysis } from '../src/shared/index.js';

// Meal analysis over HTTP with a fake AI: the photo job (202 → poll), idempotency, the per-device
// cap, device scoping, the short text parse, and validation of uploads.

let mongo: MongoMemoryServer;
let app: INestApplication;

const APP_KEY = 'AbCdEfGh12345678';
const headers = (id: string) => ({ 'x-app-key': APP_KEY, 'x-device-id': id });

const ANALYSIS: MealAnalysis = {
  isFood: true,
  title: 'Porridge',
  confidence: 0.8,
  items: [
    { name: 'Oat porridge', portion: '1 bowl', grams: 250, kcal: 310.4, proteinG: 11.24, carbsG: 54, fatG: 6, confidence: 0.8 },
  ],
};

// Controls the fake AI: each call waits for `gate` (so jobs can be held open) then resolves or fails.
let gate: Promise<void> = Promise.resolve();
let failNext = false;
const fakeAi = {
  configured: true,
  json: vi.fn(async () => {
    await gate;
    if (failNext) {
      failNext = false;
      throw new AiUnavailableError('timeout');
    }
    return ANALYSIS;
  }),
};

// A tiny but real JPEG header followed by padding (the schema needs ≥100 base64 chars).
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]).toString('base64');
const photo = (over: Record<string, unknown> = {}) => ({
  key: randomUUID(),
  image: JPEG,
  hour: 8.5,
  mealType: 'breakfast',
  ...over,
});

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  const env = loadEnv({ MONGODB_URI: mongo.getUri('halo-meals-test'), APP_KEY, RATE_LIMIT_PER_MINUTE: '1000' });
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

async function poll(device: string, jobId: string) {
  for (let i = 0; i < 50; i++) {
    const res = await http().get(`/jobs/${jobId}`).set(headers(device)).expect(200);
    if (res.body.status === 'done' || res.body.status === 'failed') return res.body;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('job never finished');
}

describe('photo analysis job', () => {
  it('returns 202 at once, then the rounded analysis when polled', async () => {
    const device = await registered();
    const res = await http().post('/meals/analyse-photo').set(headers(device)).send(photo()).expect(202);
    expect(res.body).toMatchObject({ kind: 'meal-photo' });
    const job = await poll(device, res.body.id);
    expect(job.status).toBe('done');
    expect(job.result.items[0]).toMatchObject({ kcal: 310, proteinG: 11.2 });
  });

  it('is idempotent per key and scoped to the device', async () => {
    const device = await registered();
    const body = photo();
    const first = await http().post('/meals/analyse-photo').set(headers(device)).send(body).expect(202);
    const again = await http().post('/meals/analyse-photo').set(headers(device)).send(body).expect(202);
    expect(again.body.id).toBe(first.body.id);
    const other = await registered();
    await http().get(`/jobs/${first.body.id}`).set(headers(other)).expect(404);
    await http().get('/jobs/not-an-id').set(headers(device)).expect(404);
  });

  it('caps jobs in flight per device', async () => {
    const device = await registered();
    let release!: () => void;
    gate = new Promise((r) => (release = r));
    await http().post('/meals/analyse-photo').set(headers(device)).send(photo()).expect(202);
    await http().post('/meals/analyse-photo').set(headers(device)).send(photo()).expect(202);
    await http().post('/meals/analyse-photo').set(headers(device)).send(photo()).expect(429);
    release();
    gate = Promise.resolve();
  });

  it('fails the job when the AI is unavailable, and retries the same key in place', async () => {
    const device = await registered();
    const body = photo();
    failNext = true;
    const res = await http().post('/meals/analyse-photo').set(headers(device)).send(body).expect(202);
    expect(await poll(device, res.body.id)).toMatchObject({ status: 'failed', error: 'ai_unavailable' });
    const retry = await http().post('/meals/analyse-photo').set(headers(device)).send(body).expect(202);
    expect(retry.body.id).toBe(res.body.id);
    expect((await poll(device, retry.body.id)).status).toBe('done');
  });

  it('rejects uploads that are not images', async () => {
    const device = await registered();
    const notImage = Buffer.alloc(200, 7).toString('base64');
    await http().post('/meals/analyse-photo').set(headers(device)).send(photo({ image: notImage })).expect(400);
    await http()
      .post('/meals/analyse-photo')
      .set(headers(device))
      .send(photo({ image: `data:image/jpeg;base64,${JPEG}` }))
      .expect(400);
  });
});

describe('text parse', () => {
  it('answers directly', async () => {
    const device = await registered();
    const res = await http()
      .post('/meals/parse-text')
      .set(headers(device))
      .send({ note: 'bowl of porridge with honey', hour: 8, mealType: 'breakfast' })
      .expect(200);
    expect(res.body.title).toBe('Porridge');
  });

  it('is 503 when the AI is unavailable, so the app falls back to manual entry', async () => {
    const device = await registered();
    failNext = true;
    await http()
      .post('/meals/parse-text')
      .set(headers(device))
      .send({ note: 'toast', hour: 8, mealType: 'breakfast' })
      .expect(503);
  });
});
