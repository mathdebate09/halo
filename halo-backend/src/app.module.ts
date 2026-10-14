import { type DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';

import { ENV, type Env } from './config.js';
import { DeviceThrottlerGuard } from './device/device-throttler.guard.js';
import { DeviceGuard } from './device/device.guard.js';
import { DeviceModule } from './device/device.module.js';
import { HealthController } from './health/health.controller.js';
import { LegalController } from './legal/legal.controller.js';
import { SyncModule } from './sync/sync.module.js';

@Module({})
export class AppModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: AppModule,
      imports: [
        MongooseModule.forRoot(env.MONGODB_URI),
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: env.RATE_LIMIT_PER_MINUTE }]),
        DeviceModule,
        SyncModule,
      ],
      controllers: [HealthController, LegalController],
      providers: [
        { provide: ENV, useValue: env },
        // Order matters: rate-limit first (cheap), then authenticate the device.
        { provide: APP_GUARD, useClass: DeviceThrottlerGuard },
        { provide: APP_GUARD, useClass: DeviceGuard },
      ],
    };
  }
}
