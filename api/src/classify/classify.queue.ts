import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';

export const CLASSIFY_QUEUE = 'classify';
export const CLASSIFY_ATTEMPTS = 3;

export interface ClassifyJob {
  attemptId: string;
}

/** BullMQ needs its own connections with maxRetriesPerRequest: null. */
export function bullConnection(env: Env): Redis {
  return new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
}

@Injectable()
export class ClassifyQueue implements OnModuleDestroy {
  private readonly log = new Logger(ClassifyQueue.name);
  private readonly connection: Redis;
  readonly queue: Queue<ClassifyJob>;

  constructor(@Inject(ENV) env: Env) {
    this.connection = bullConnection(env);
    this.queue = new Queue<ClassifyJob>(CLASSIFY_QUEUE, {
      connection: this.connection,
      defaultJobOptions: {
        attempts: CLASSIFY_ATTEMPTS,
        backoff: { type: 'exponential', delay: env.CLASSIFY_BACKOFF_MS },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    });
  }

  /** Never fails the caller: a missing label is better than a failed attempt. */
  async enqueue(attemptId: string): Promise<void> {
    try {
      await this.queue.add('classify', { attemptId }, { jobId: `attempt-${attemptId}` });
    } catch (err) {
      this.log.error(`could not enqueue classify for attempt ${attemptId}: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
    await this.connection.quit().catch(() => undefined);
  }
}
