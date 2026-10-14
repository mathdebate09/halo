import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { SyncController } from './sync.controller.js';
import {
  Counter,
  CounterSchema,
  OpLog,
  OpLogSchema,
  SyncRecord,
  SyncRecordSchema,
} from './sync.schemas.js';
import { SyncService } from './sync.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SyncRecord.name, schema: SyncRecordSchema },
      { name: Counter.name, schema: CounterSchema },
      { name: OpLog.name, schema: OpLogSchema },
    ]),
  ],
  controllers: [SyncController],
  providers: [SyncService],
  exports: [SyncService],
})
export class SyncModule {}
