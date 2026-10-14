import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

/** An anonymous install. The UUID is the identity; there is no login (SPEC §2). */
@Schema({ collection: 'devices', timestamps: true })
export class Device {
  @Prop({ type: String, required: true })
  _id!: string; // device UUID

  @Prop()
  platform?: string;

  @Prop()
  lastSeenAt?: Date;
}

export type DeviceDocument = HydratedDocument<Device>;
export const DeviceSchema = SchemaFactory.createForClass(Device);
