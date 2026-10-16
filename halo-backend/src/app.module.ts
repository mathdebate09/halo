import { type DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';

import { AdvisorModule } from './advisor/advisor.module.js';
import { AiModule } from './ai/ai.module.js';
import { ENV, type Env } from './config.js';
import { DeviceThrottlerGuard } from './device/device-throttler.guard.js';
import { DeviceGuard } from './device/device.guard.js';
import { DeviceModule } from './device/device.module.js';
import { HealthController } from './health/health.controller.js';
import { InsightsModule } from './insights/insights.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { LegalController } from './legal/legal.controller.js';
import { MealsModule } from './meals/meals.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { SyncModule } from './sync/sync.module.js';

@Module({})
export class AppModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: AppModule,
      // ENV is injected by feature modules too (AiService, JobsService).
      global: true,
      exports: [ENV],
      imports: [
        MongooseModule.forRoot(env.MONGODB_URI),
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: env.RATE_LIMIT_PER_MINUTE }]),
        AiModule,
        DeviceModule,
        SyncModule,
        JobsModule,
        MealsModule,
        ReportsModule,
        InsightsModule,
        AdvisorModule,
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
