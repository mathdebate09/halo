import { Body, Controller, Get, Inject, NotFoundException, Param, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';

import { DeviceId } from '../common/device-request.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ENV, type Env } from '../config.js';
import { type AdvisorTurnBody, advisorTurnBodySchema, sseFrame } from '../shared/index.js';
import { AdvisorService } from './advisor.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller('advisor')
export class AdvisorController {
  constructor(
    private readonly advisor: AdvisorService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * Conversational call (SPEC §5 pattern 3). With `Accept: text/event-stream` the reply streams as
   * SSE: a comment at once (Heroku wants a first byte within 30 s), a heartbeat, then the events.
   * Otherwise 202 and the app polls GET /advisor/turns/:id.
   */
  @Post('turns')
  async turn(
    @DeviceId() deviceId: string,
    @Body(new ZodValidationPipe(advisorTurnBodySchema)) body: AdvisorTurnBody,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const turn = await this.advisor.begin(deviceId, body);
    if (!req.headers.accept?.includes('text/event-stream')) {
      res.status(202).json({ turnId: turn.turnId });
      return;
    }
    res.status(200);
    res.setHeader('content-type', 'text/event-stream; charset=utf-8');
    res.setHeader('cache-control', 'no-cache, no-transform');
    res.setHeader('connection', 'keep-alive');
    // Proxies must pass each event on as it comes.
    res.setHeader('x-accel-buffering', 'no');
    res.flushHeaders();
    res.write(': open\n\n');

    const ping = setInterval(() => res.write(': ping\n\n'), this.env.ADVISOR_PING_MS);
    let unsubscribe = () => {};
    const close = () => {
      clearInterval(ping);
      unsubscribe();
    };
    // The turn keeps running if the phone goes away; the poll picks it up.
    res.on('close', close);
    unsubscribe = turn.subscribe((event) => {
      res.write(sseFrame(event));
      if (event.type === 'done' || event.type === 'error') {
        close();
        res.end();
      }
    });
  }

  /** The poll, and the resume after the app was in the background. */
  @Get('turns/:id')
  async state(@DeviceId() deviceId: string, @Param('id') id: string) {
    const state = UUID.test(id) ? await this.advisor.state(deviceId, id) : null;
    if (!state) throw new NotFoundException();
    return state;
  }
}
