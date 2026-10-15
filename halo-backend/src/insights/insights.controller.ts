import { Body, Controller, HttpCode, Post, ServiceUnavailableException } from '@nestjs/common';

import { AiUnavailableError } from '../ai/ai.service.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { type PhraseBody, phraseBodySchema } from '../shared/index.js';
import { InsightsService } from './insights.service.js';

@Controller('insights')
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  /**
   * Short call (SPEC §5 pattern 1): rewords brief patterns. Items that fail the guard are left
   * out, so the app keeps its template for them; 503 when the AI is unavailable.
   */
  @Post('phrase')
  @HttpCode(200)
  async phrase(@Body(new ZodValidationPipe(phraseBodySchema)) body: PhraseBody) {
    try {
      return await this.insights.phrase(body);
    } catch (error) {
      if (error instanceof AiUnavailableError) throw new ServiceUnavailableException('AI unavailable');
      throw error;
    }
  }
}
