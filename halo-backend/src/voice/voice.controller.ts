import { Readable } from 'node:stream';

import { Body, Controller, Get, HttpCode, NotFoundException, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';

import { DeviceId } from '../common/device-request.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { VOICE_LIMITS, type VoiceTurnRequest, voiceTurnRequestSchema } from '../shared/index.js';
import { VoiceService } from './voice.service.js';

@Controller('voice')
export class VoiceController {
  constructor(private readonly voice: VoiceService) {}

  /**
   * A short call (SPEC §5 pattern 1): the recording in, one line and its actions out, within the
   * turn's budget. The speech is fetched next, so the line shows before the voice starts.
   */
  @Post('turns')
  @HttpCode(200)
  turn(@DeviceId() deviceId: string, @Body(new ZodValidationPipe(voiceTurnRequestSchema)) body: VoiceTurnRequest) {
    return this.voice.turn(deviceId, body);
  }

  /** The reply read aloud: raw PCM, passed on as it's made so playback starts early. */
  @Get('speech/:id')
  async speech(@DeviceId() deviceId: string, @Param('id') id: string, @Res() res: Response) {
    const stream = await this.voice.speech(deviceId, id);
    if (!stream) throw new NotFoundException();
    res.status(200);
    res.setHeader('content-type', 'audio/pcm');
    res.setHeader('x-sample-rate', String(VOICE_LIMITS.speechRate));
    res.setHeader('cache-control', 'no-store');
    res.flushHeaders();
    const body = Readable.fromWeb(stream as Parameters<typeof Readable.fromWeb>[0]);
    // The phone stopped listening (a tap on the ring): stop fetching too.
    res.on('close', () => body.destroy());
    body.pipe(res);
  }
}
