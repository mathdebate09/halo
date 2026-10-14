import { Body, Controller, HttpCode, Post, ServiceUnavailableException } from '@nestjs/common';

import { AiUnavailableError } from '../ai/ai.service.js';
import { DeviceId } from '../common/device-request.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { JobsService } from '../jobs/jobs.service.js';
import {
  type AnalysePhotoBody,
  analysePhotoBodySchema,
  type ParseTextBody,
  parseTextBodySchema,
} from '../shared/index.js';
import { MealsService } from './meals.service.js';

@Controller('meals')
export class MealsController {
  constructor(
    private readonly meals: MealsService,
    private readonly jobs: JobsService,
  ) {}

  /** Long call: 202 with a job to poll (GET /jobs/:id). The photo lives only in this job's memory. */
  @Post('analyse-photo')
  @HttpCode(202)
  analysePhoto(
    @DeviceId() deviceId: string,
    @Body(new ZodValidationPipe(analysePhotoBodySchema)) body: AnalysePhotoBody,
  ) {
    if (!this.meals.available) throw new ServiceUnavailableException('AI is not configured');
    const { image, key, ...rest } = body;
    const photo = this.meals.decodePhoto(image);
    return this.jobs.start(deviceId, 'meal-photo', key, () => this.meals.analysePhoto(rest, photo));
  }

  /** Short call: the parsed meal, or 503 so the app falls back to manual entry. */
  @Post('parse-text')
  @HttpCode(200)
  async parseText(@Body(new ZodValidationPipe(parseTextBodySchema)) body: ParseTextBody) {
    try {
      return await this.meals.parseText(body);
    } catch (error) {
      if (error instanceof AiUnavailableError) throw new ServiceUnavailableException('AI unavailable');
      throw error;
    }
  }
}
