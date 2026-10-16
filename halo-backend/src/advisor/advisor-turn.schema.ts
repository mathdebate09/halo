import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema } from 'mongoose';

import { ADVISOR_ERRORS, type AdvisorCard, type AdvisorError, RED_FLAGS, type RedFlag } from '../shared/index.js';

const DAY_MS = 24 * 3600 * 1000;

/**
 * An Advisor reply, kept for polling and resuming. Never the user's message or the snapshot: the
 * phone keeps the conversation; this is only the answer on its way there.
 */
@Schema({ collection: 'advisor_turns', timestamps: true })
export class AdvisorTurn {
  @Prop({ type: String, required: true })
  deviceId!: string;

  /** Client-made: the same id never runs twice. */
  @Prop({ type: String, required: true })
  turnId!: string;

  /** The day the conversation belongs to. */
  @Prop({ type: String, required: true })
  threadId!: string;

  @Prop({ type: String, required: true, enum: ['running', 'done', 'failed'], default: 'running' })
  status!: 'running' | 'done' | 'failed';

  /** The checked sentences so far. */
  @Prop({ type: String, default: '' })
  text!: string;

  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
  cards!: AdvisorCard[];

  @Prop({ type: String, enum: [...RED_FLAGS, null], default: null })
  flag!: RedFlag | null;

  @Prop({ type: String, enum: [...ADVISOR_ERRORS, null], default: null })
  error!: AdvisorError | null;

  @Prop({ type: Date, default: () => new Date(Date.now() + DAY_MS) })
  expireAt!: Date;
}
export const AdvisorTurnSchema = SchemaFactory.createForClass(AdvisorTurn);
AdvisorTurnSchema.index({ deviceId: 1, turnId: 1 }, { unique: true });
AdvisorTurnSchema.index({ deviceId: 1, status: 1, updatedAt: 1 });
AdvisorTurnSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });
