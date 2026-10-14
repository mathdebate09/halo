import { Module } from '@nestjs/common';

import { JobsModule } from '../jobs/jobs.module.js';
import { MealsController } from './meals.controller.js';
import { MealsService } from './meals.service.js';

@Module({
  imports: [JobsModule],
  controllers: [MealsController],
  providers: [MealsService],
})
export class MealsModule {}
