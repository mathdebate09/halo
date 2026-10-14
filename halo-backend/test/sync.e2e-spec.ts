import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { loadEnv } from '../src/config.js';

// Full app over HTTP against an in-memory MongoDB: device gate, push/pull, LWW, idempotency.

let mongo: MongoMemoryServer;
let app: INestApplication;

const APP_KEY = 'AbCdEfGh12345678';
const device = () => ({ id: randomUUID() });
const headers = (d: { id: string }, appKey = APP_KEY) => ({ 'x-app-key': appKey, 'x-device-id': d.id });
const op = (over: Record<string, unknown> = {}) => ({
  opId: randomUUID(),
  entity: 'water',
  id: randomUUID(),
  op: 'upsert',
  updatedAt: 1_000,
  data: { day: '2026-10-14', at: 1_000, ml: 250, syncState: 'pending' },
  ...over,
});

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  const env = loadEnv({
    MONGODB_URI: mongo.getUri('halo-test'),
    APP_KEY,
    RATE_LIMIT_PER_MINUTE: '1000',
  });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(env)] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
}, 120_000);

afterAll(async () => {
  await app?.close();
  await mongo?.stop();
});

const http = () => request(app.getHttpServer());

async function registered() {
  const d = device();
  await http().post('/device/register').set(headers(d)).send({ platform: 'android' }).expect(200);
  return d;
}

describe('health', () => {
  it('is public and reports the database', async () => {
    const res = await http().get('/health').expect(200);
    expect(res.body).toEqual({ ok: true, db: true });
  });
});

describe('device gate', () => {
  it('registers idempotently', async () => {
    const d = device();
    const first = await http().post('/device/register').set(headers(d)).send({}).expect(200);
    expect(first.body).toEqual({ registered: true, created: true });
    const again = await http().post('/device/register').set(headers(d)).send({}).expect(200);
    expect(again.body.created).toBe(false);
  });

  it('requires the shared app key everywhere except /health', async () => {
    const d = device();
    await http().post('/device/register').set(headers(d, 'WrongKey12345678')).send({}).expect(401);
    await http().post('/device/register').set({ 'x-device-id': d.id }).send({}).expect(401);
    const known = await registered();
    await http().get('/sync/pull').set(headers(known, 'WrongKey12345678')).expect(401);
    await http().get('/health').expect(200);
  });

  it('blocks unregistered and malformed device ids', async () => {
    await http().get('/sync/pull').set(headers(device())).expect(401);
    await http().get('/sync/pull').set(headers({ id: 'not-a-uuid' })).expect(401);
    await http().post('/device/register').set(headers({ id: 'not-a-uuid' })).send({}).expect(401);
  });
});

describe('sync', () => {
  it('pushes and pulls with a moving cursor, scoped to the device', async () => {
    const a = await registered();
    const b = await registered();
    const ops = [op(), op({ entity: 'weight', data: { day: '2026-10-14', at: 1, kg: 70, source: 'manual' } })];
    const push = await http().post('/sync/push').set(headers(a)).send({ ops }).expect(200);
    expect(push.body.results.map((r: { status: string }) => r.status)).toEqual(['applied', 'applied']);

    const pull = await http().get('/sync/pull?since=0').set(headers(a)).expect(200);
    expect(pull.body.changes).toHaveLength(2);
    expect(pull.body.changes[0].data).not.toHaveProperty('syncState');
    expect(pull.body.hasMore).toBe(false);

    const after = await http().get(`/sync/pull?since=${pull.body.cursor}`).set(headers(a)).expect(200);
    expect(after.body.changes).toHaveLength(0);

    const other = await http().get('/sync/pull').set(headers(b)).expect(200);
    expect(other.body.changes).toHaveLength(0);
  });

  it('is idempotent by opId', async () => {
    const d = await registered();
    const same = op();
    await http().post('/sync/push').set(headers(d)).send({ ops: [same] }).expect(200);
    const retry = await http().post('/sync/push').set(headers(d)).send({ ops: [same] }).expect(200);
    expect(retry.body.results[0].status).toBe('applied');
    const pull = await http().get('/sync/pull').set(headers(d)).expect(200);
    expect(pull.body.changes).toHaveLength(1);
  });

  it('keeps the newest write (last-write-wins) and reports older ones as stale', async () => {
    const d = await registered();
    const id = randomUUID();
    await http()
      .post('/sync/push')
      .set(headers(d))
      .send({ ops: [op({ id, updatedAt: 2_000, data: { ml: 500 } })] })
      .expect(200);
    const old = await http()
      .post('/sync/push')
      .set(headers(d))
      .send({ ops: [op({ id, updatedAt: 1_500, data: { ml: 100 } })] })
      .expect(200);
    expect(old.body.results[0].status).toBe('stale');
    const pull = await http().get('/sync/pull').set(headers(d)).expect(200);
    expect(pull.body.changes.at(-1).data).toEqual({ ml: 500 });
  });

  it('turns deletes into tombstones that pull reports without data', async () => {
    const d = await registered();
    const id = randomUUID();
    await http().post('/sync/push').set(headers(d)).send({ ops: [op({ id })] }).expect(200);
    await http()
      .post('/sync/push')
      .set(headers(d))
      .send({ ops: [op({ id, op: 'delete', updatedAt: 3_000, data: undefined })] })
      .expect(200);
    const pull = await http().get('/sync/pull').set(headers(d)).expect(200);
    const change = pull.body.changes.find((c: { id: string }) => c.id === id);
    expect(change).toMatchObject({ deleted: true, data: null, updatedAt: 3_000 });
  });

  it('pages pulls with hasMore', async () => {
    const d = await registered();
    const ops = Array.from({ length: 5 }, () => op());
    await http().post('/sync/push').set(headers(d)).send({ ops }).expect(200);
    const page1 = await http().get('/sync/pull?limit=3').set(headers(d)).expect(200);
    expect(page1.body.changes).toHaveLength(3);
    expect(page1.body.hasMore).toBe(true);
    const page2 = await http().get(`/sync/pull?since=${page1.body.cursor}&limit=3`).set(headers(d)).expect(200);
    expect(page2.body.changes).toHaveLength(2);
    expect(page2.body.hasMore).toBe(false);
  });

  it('validates the push body against the shared contract', async () => {
    const d = await registered();
    await http().post('/sync/push').set(headers(d)).send({ ops: [] }).expect(400);
    await http()
      .post('/sync/push')
      .set(headers(d))
      .send({ ops: [op({ entity: 'nonsense' })] })
      .expect(400);
    const noData = await http()
      .post('/sync/push')
      .set(headers(d))
      .send({ ops: [op({ data: undefined })] })
      .expect(200);
    expect(noData.body.results[0].status).toBe('rejected');
  });
});
