import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema } from 'mongoose';

import { JOB_STATUSES, type JobStatus } from '../shared/index.js';

const DAY_MS = 24 * 3600 * 1000;

/** A long AI call's state, so polling survives restarts. Inputs (photos) are never stored. */
@Schema({ collection: 'jobs', timestamps: true })
export class Job {
  @Prop({ type: String, required: true })
  deviceId!: string;

  /** Client idempotency key: the same key returns the same job. */
  @Prop({ type: String, required: true })
  key!: string;

  @Prop({ type: String, required: true })
  kind!: string;

  @Prop({ type: String, required: true, enum: JOB_STATUSES, default: 'queued' })
  status!: JobStatus;

  @Prop({ type: MongooseSchema.Types.Mixed, default: null })
  result!: unknown;

  @Prop({ type: String, default: null })
  error!: string | null;

  /** TTL: finished or not, a job is gone a day later. */
  @Prop({ type: Date, default: () => new Date(Date.now() + DAY_MS) })
  expireAt!: Date;
}
export const JobSchema = SchemaFactory.createForClass(Job);
JobSchema.index({ deviceId: 1, key: 1 }, { unique: true });
JobSchema.index({ deviceId: 1, status: 1 });
JobSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });
