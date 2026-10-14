import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export type DeviceRequest = Request & { deviceId?: string };

/** The authenticated device id, set by DeviceGuard. Every query is scoped by it. */
export const DeviceId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const deviceId = ctx.switchToHttp().getRequest<DeviceRequest>().deviceId;
  if (!deviceId) throw new Error('DeviceId used on a route without DeviceGuard');
  return deviceId;
});
