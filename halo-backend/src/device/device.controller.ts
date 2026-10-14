import { Body, Controller, HttpCode, Post } from '@nestjs/common';

import { DeviceId } from '../common/device-request.js';
import { SkipDeviceCheck } from '../common/public.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { type RegisterBody, registerBodySchema } from '../shared/index.js';
import { DeviceService } from './device.service.js';

@Controller('device')
export class DeviceController {
  constructor(private readonly devices: DeviceService) {}

  /** Creates the device record the guard checks; the app key is still required. */
  @SkipDeviceCheck()
  @Post('register')
  @HttpCode(200)
  async register(
    @DeviceId() deviceId: string,
    @Body(new ZodValidationPipe(registerBodySchema)) body: RegisterBody,
  ) {
    const created = await this.devices.register(deviceId, body.platform);
    return { registered: true, created };
  }
}
