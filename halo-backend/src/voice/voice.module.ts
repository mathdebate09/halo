import { Module } from '@nestjs/common';

import { AdvisorModule } from '../advisor/advisor.module.js';
import { OpenAiService } from './openai.service.js';
import { VoiceController } from './voice.controller.js';
import { VoiceService } from './voice.service.js';
import { VoiceTools } from './voice.tools.js';

@Module({
  imports: [AdvisorModule],
  controllers: [VoiceController],
  providers: [VoiceService, VoiceTools, OpenAiService],
})
export class VoiceModule {}
