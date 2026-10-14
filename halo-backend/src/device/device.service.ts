import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

import { Device } from './device.schema.js';

@Injectable()
export class DeviceService {
  /** Devices are never deleted, so known ids can be cached in memory. */
  private readonly known = new Set<string>();

  constructor(@InjectModel(Device.name) private readonly devices: Model<Device>) {}

  /** Idempotent. Returns whether this call created the device. */
  async register(deviceId: string, platform?: string): Promise<boolean> {
    const result = await this.devices.updateOne(
      { _id: deviceId },
      { $set: { lastSeenAt: new Date(), ...(platform ? { platform } : {}) } },
      { upsert: true },
    );
    this.known.add(deviceId);
    return result.upsertedCount === 1;
  }

  async exists(deviceId: string): Promise<boolean> {
    if (this.known.has(deviceId)) return true;
    const found = await this.devices.exists({ _id: deviceId });
    if (found) this.known.add(deviceId);
    return !!found;
  }
}
