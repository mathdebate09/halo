import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

import {
  type OpStatus,
  type PullResult,
  type PushResult,
  SYNC_ONLY_FIELDS,
  type SyncOp,
} from '../shared/index.js';
import { Counter, OpLog, SyncRecord } from './sync.schemas.js';

const isDuplicateKey = (error: unknown) => (error as { code?: number }).code === 11000;

function cleanData(data: Record<string, unknown> | undefined) {
  if (!data) return null;
  const copy = { ...data };
  for (const field of SYNC_ONLY_FIELDS) delete copy[field];
  return copy;
}

@Injectable()
export class SyncService {
  constructor(
    @InjectModel(SyncRecord.name) private readonly records: Model<SyncRecord>,
    @InjectModel(Counter.name) private readonly counters: Model<Counter>,
    @InjectModel(OpLog.name) private readonly opLog: Model<OpLog>,
  ) {}

  private async nextSeq(deviceId: string): Promise<number> {
    const counter = await this.counters
      .findOneAndUpdate({ _id: deviceId }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' })
      .lean();
    return counter!.seq;
  }

  /** Ops apply in order; each one is idempotent by opId and last-write-wins by updatedAt. */
  async push(deviceId: string, ops: SyncOp[]): Promise<PushResult> {
    const results: PushResult['results'] = [];
    for (const op of ops) results.push({ opId: op.opId, status: await this.applyOp(deviceId, op) });
    return { results };
  }

  private async applyOp(deviceId: string, op: SyncOp): Promise<OpStatus> {
    const seen = await this.opLog.findById(op.opId).lean();
    if (seen) return seen.deviceId === deviceId ? (seen.status as OpStatus) : 'rejected';

    const status = await this.write(deviceId, op);
    try {
      await this.opLog.create({ _id: op.opId, deviceId, status });
    } catch (error) {
      if (!isDuplicateKey(error)) throw error; // a concurrent retry recorded it first
    }
    return status;
  }

  private async write(deviceId: string, op: SyncOp): Promise<OpStatus> {
    if (op.op === 'upsert' && !op.data) return 'rejected';
    const key = { deviceId, entity: op.entity, clientId: op.id };
    const deleted = op.op === 'delete';
    const update = {
      ...key,
      updatedAt: op.updatedAt,
      deletedAt: deleted ? op.updatedAt : null,
      // A tombstone keeps the last known data; pull sends null for deleted records.
      ...(deleted ? {} : { data: cleanData(op.data) }),
      seq: await this.nextSeq(deviceId),
    };
    try {
      // Matches only if the stored write is not newer; otherwise the upsert's insert collides
      // with the unique key, which means a newer write already won.
      await this.records.updateOne(
        { ...key, updatedAt: { $lte: op.updatedAt } },
        { $set: update },
        { upsert: true },
      );
      return 'applied';
    } catch (error) {
      if (isDuplicateKey(error)) return 'stale';
      throw error;
    }
  }

  async pull(deviceId: string, since: number, limit: number): Promise<PullResult> {
    const rows = await this.records
      .find({ deviceId, seq: { $gt: since } })
      .sort({ seq: 1 })
      .limit(limit + 1)
      .lean();
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    return {
      changes: page.map((r) => ({
        entity: r.entity,
        id: r.clientId,
        updatedAt: r.updatedAt,
        deleted: r.deletedAt != null,
        data: r.deletedAt != null ? null : r.data,
      })),
      cursor: page.at(-1)?.seq ?? since,
      hasMore,
    };
  }
}
