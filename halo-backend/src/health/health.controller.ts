import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';

import { Public } from '../common/public.decorator.js';

/** The app calls this at launch so a sleeping dyno wakes while the splash plays. */
@Controller('health')
export class HealthController {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  @Public()
  @Get()
  health() {
    return { ok: true, db: this.connection.readyState === 1 };
  }
}
