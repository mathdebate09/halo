import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema } from 'mongoose';

import { SYNC_ENTITIES, type SyncEntity } from '../shared/index.js';

/**
 * Every synced client record, one collection for all entities. Domain modules (meals, vitals…)
 * read and enrich these by entity; writes go through SyncService so seq stays monotonic.
 */
@Schema({ collection: 'records', timestamps: { createdAt: 'serverCreatedAt', updatedAt: 'serverUpdatedAt' } })
export class SyncRecord {
  @Prop({ type: String, required: true })
  deviceId!: string;

  @Prop({ type: String, required: true, enum: SYNC_ENTITIES })
  entity!: SyncEntity;

  @Prop({ required: true })
  clientId!: string;

  @Prop({ type: MongooseSchema.Types.Mixed, default: null })
  data!: Record<string, unknown> | null;

  /** Client clock (epoch ms) of the winning write. */
  @Prop({ required: true })
  updatedAt!: number;

  @Prop({ type: Number, default: null })
  deletedAt!: number | null;

  /** Per-device monotonic sequence: the pull cursor. */
  @Prop({ required: true })
  seq!: number;
}
export const SyncRecordSchema = SchemaFactory.createForClass(SyncRecord);
SyncRecordSchema.index({ deviceId: 1, entity: 1, clientId: 1 }, { unique: true });
SyncRecordSchema.index({ deviceId: 1, seq: 1 });

/** Per-device sequence counter. */
@Schema({ collection: 'counters', versionKey: false })
export class Counter {
  @Prop({ type: String, required: true })
  _id!: string; // device id

  @Prop({ required: true, default: 0 })
  seq!: number;
}
export const CounterSchema = SchemaFactory.createForClass(Counter);

/** Processed op ids, so a retried push returns the same answer. Expires after 30 days. */
@Schema({ collection: 'ops', versionKey: false })
export class OpLog {
  @Prop({ type: String, required: true })
  _id!: string; // opId

  @Prop({ required: true })
  deviceId!: string;

  @Prop({ required: true })
  status!: string;

  @Prop({ type: Date, default: () => new Date(), expires: 60 * 60 * 24 * 30 })
  createdAt!: Date;
}
export const OpLogSchema = SchemaFactory.createForClass(OpLog);
