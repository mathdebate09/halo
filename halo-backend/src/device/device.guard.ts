import { timingSafeEqual } from 'node:crypto';

import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { DeviceRequest } from '../common/device-request.js';
import { IS_PUBLIC, SKIP_DEVICE_CHECK } from '../common/public.decorator.js';
import { ENV, type Env } from '../config.js';
import { APP_KEY_HEADER, DEVICE_ID_HEADER, deviceIdSchema } from '../shared/index.js';
import { DeviceService } from './device.service.js';

/**
 * Global guard. Every route except @Public needs the shared app key; every route except
 * @SkipDeviceCheck also needs a registered device id, which then scopes the request.
 */
@Injectable()
export class DeviceGuard implements CanActivate {
  private readonly appKey: Buffer;

  constructor(
    private readonly reflector: Reflector,
    private readonly devices: DeviceService,
    @Inject(ENV) env: Env,
  ) {
    this.appKey = Buffer.from(env.APP_KEY);
  }

  private flag(key: string, context: ExecutionContext) {
    return this.reflector.getAllAndOverride<boolean>(key, [context.getHandler(), context.getClass()]);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.flag(IS_PUBLIC, context)) return true;
    const req = context.switchToHttp().getRequest<DeviceRequest>();

    const sent = req.headers[APP_KEY_HEADER];
    const key = Buffer.from(typeof sent === 'string' ? sent : '');
    if (key.length !== this.appKey.length || !timingSafeEqual(key, this.appKey)) {
      throw new UnauthorizedException('Missing or wrong app key');
    }

    const id = deviceIdSchema.safeParse(req.headers[DEVICE_ID_HEADER]);
    if (!id.success) throw new UnauthorizedException('Missing or malformed device id');
    req.deviceId = id.data;

    if (!this.flag(SKIP_DEVICE_CHECK, context) && !(await this.devices.exists(id.data))) {
      throw new UnauthorizedException('Unknown device');
    }
    return true;
  }
}
