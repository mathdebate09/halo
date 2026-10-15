import { Module } from '@nestjs/common';

import { JobsModule } from '../jobs/jobs.module.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

@Module({
  imports: [JobsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
