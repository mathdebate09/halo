import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, type Model } from 'mongoose';

import { AiUnavailableError } from '../ai/ai.service.js';
import { ENV, type Env } from '../config.js';
import type { JobView } from '../shared/index.js';
import { Job } from './job.schema.js';

type JobDoc = Job & { _id: { toString(): string } };

const view = (job: JobDoc): JobView => ({
  id: job._id.toString(),
  kind: job.kind,
  status: job.status,
  ...(job.status === 'done' ? { result: job.result } : {}),
  ...(job.status === 'failed' && job.error ? { error: job.error } : {}),
});

/**
 * The job pattern (SPEC §5): start returns at once with a job id, the work runs in-process, and
 * the client polls. State lives in MongoDB; the work itself can't outlive the process.
 */
@Injectable()
export class JobsService implements OnModuleInit {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    @InjectModel(Job.name) private readonly jobs: Model<Job>,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Work in flight when the process stopped is lost (inputs aren't stored): fail it so the client resubmits. */
  async onModuleInit() {
    const { modifiedCount } = await this.jobs.updateMany(
      { status: { $in: ['queued', 'running'] } },
      { status: 'failed', error: 'interrupted' },
    );
    if (modifiedCount) this.logger.warn(`Marked ${modifiedCount} interrupted job(s) failed`);
  }

  /**
   * Starts `work` as a job, or returns the existing job for this device + key (idempotent). A
   * device may have MAX_JOBS_PER_DEVICE jobs queued or running at once.
   */
  async start(deviceId: string, kind: string, key: string, work: () => Promise<unknown>): Promise<JobView> {
    const existing = await this.jobs.findOne({ deviceId, key }).lean<JobDoc>();
    if (existing && existing.status !== 'failed') return view(existing);

    const active = await this.jobs.countDocuments({ deviceId, status: { $in: ['queued', 'running'] } });
    if (active >= this.env.MAX_JOBS_PER_DEVICE) {
      throw new HttpException('Too many jobs in progress', HttpStatus.TOO_MANY_REQUESTS);
    }

    // A failed job with the same key is retried in place.
    const job = await this.jobs
      .findOneAndUpdate(
        { deviceId, key },
        { $set: { kind, status: 'queued', result: null, error: null } },
        { upsert: true, new: true },
      )
      .lean<JobDoc>();
    void this.run(job._id.toString(), work);
    return view(job);
  }

  async get(deviceId: string, id: string): Promise<JobView> {
    const job = isValidObjectId(id) ? await this.jobs.findOne({ _id: id, deviceId }).lean<JobDoc>() : null;
    if (!job) throw new NotFoundException('No such job');
    return view(job);
  }

  private async run(id: string, work: () => Promise<unknown>) {
    await this.jobs.updateOne({ _id: id }, { status: 'running' });
    try {
      const result = await work();
      await this.jobs.updateOne({ _id: id }, { status: 'done', result });
    } catch (error) {
      const reason = error instanceof AiUnavailableError ? 'ai_unavailable' : 'error';
      if (reason === 'error') this.logger.error(`Job ${id} failed: ${error instanceof Error ? error.name : 'unknown'}`);
      await this.jobs.updateOne({ _id: id }, { status: 'failed', error: reason });
    }
  }
}
