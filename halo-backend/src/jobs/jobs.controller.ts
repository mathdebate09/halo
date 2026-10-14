import { Controller, Get, Param } from '@nestjs/common';

import { DeviceId } from '../common/device-request.js';
import { JobsService } from './jobs.service.js';

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get(':id')
  get(@DeviceId() deviceId: string, @Param('id') id: string) {
    return this.jobs.get(deviceId, id);
  }
}
