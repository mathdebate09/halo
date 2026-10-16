import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { MealsModule } from '../meals/meals.module.js';
import { AdvisorTurn, AdvisorTurnSchema } from './advisor-turn.schema.js';
import { AdvisorController } from './advisor.controller.js';
import { AdvisorService } from './advisor.service.js';
import { AdvisorTools } from './advisor.tools.js';

@Module({
  imports: [MongooseModule.forFeature([{ name: AdvisorTurn.name, schema: AdvisorTurnSchema }]), MealsModule],
  controllers: [AdvisorController],
  providers: [AdvisorService, AdvisorTools],
})
export class AdvisorModule {}
