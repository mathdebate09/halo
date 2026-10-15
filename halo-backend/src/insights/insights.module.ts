import { Module } from '@nestjs/common';

import { InsightsController } from './insights.controller.js';
import { InsightsService } from './insights.service.js';

@Module({
  controllers: [InsightsController],
  providers: [InsightsService],
})
export class InsightsModule {}
