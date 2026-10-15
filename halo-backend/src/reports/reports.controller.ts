import { Body, Controller, HttpCode, Inject, Post, ServiceUnavailableException } from '@nestjs/common';

import { DeviceId } from '../common/device-request.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ENV, type Env } from '../config.js';
import { JobsService } from '../jobs/jobs.service.js';
import { type ReportPageBody, reportPageBodySchema } from '../shared/index.js';
import { ReportsService } from './reports.service.js';

@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly jobs: JobsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * One page of a report (its text layer or image tiles): 202 with a job to poll (GET /jobs/:id).
   * The page lives only in this job's memory; the result holds only the values.
   */
  @Post('pages')
  @HttpCode(202)
  readPage(
    @DeviceId() deviceId: string,
    @Body(new ZodValidationPipe(reportPageBodySchema)) body: ReportPageBody,
  ) {
    if (!this.reports.available) throw new ServiceUnavailableException('AI is not configured');
    const tiles = body.tiles ? this.reports.decodeTiles(body.tiles) : null;
    return this.jobs.start(deviceId, 'report-page', body.key, () => this.reports.readPage(body, tiles), {
      inFlight: this.env.REPORT_PAGES_IN_FLIGHT,
      perDay: this.env.REPORT_PAGES_PER_DAY,
    });
  }
}
