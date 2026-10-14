import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';

import { DeviceId } from '../common/device-request.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  type PullQuery,
  pullQuerySchema,
  type PushBody,
  pushBodySchema,
} from '../shared/index.js';
import { SyncService } from './sync.service.js';

@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Post('push')
  @HttpCode(200)
  push(@DeviceId() deviceId: string, @Body(new ZodValidationPipe(pushBodySchema)) body: PushBody) {
    return this.sync.push(deviceId, body.ops);
  }

  @Get('pull')
  pull(@DeviceId() deviceId: string, @Query(new ZodValidationPipe(pullQuerySchema)) query: PullQuery) {
    return this.sync.pull(deviceId, query.since, query.limit);
  }
}
