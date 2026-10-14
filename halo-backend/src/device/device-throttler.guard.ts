import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

import { DEVICE_ID_HEADER } from '../shared/index.js';

/** Rate-limits per device rather than per IP (many phones can share a NAT). */
@Injectable()
export class DeviceThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, any>): Promise<string> {
    const id = req.headers?.[DEVICE_ID_HEADER];
    return typeof id === 'string' && id ? `device:${id}` : `ip:${req.ip}`;
  }
}
