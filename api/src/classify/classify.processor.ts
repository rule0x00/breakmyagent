import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import Redis from 'ioredis';
import { Pool } from 'pg';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { PG_POOL } from '../db/db.module';
import { LeaderboardGateway } from '../leaderboard/leaderboard.gateway';
import { AGENT_CLIENT, type AgentClient } from '../play/agent.client';
import { PlayService } from '../play/play.service';
import { BudgetService } from '../ratelimit/budget.service';
import { bullConnection, CLASSIFY_QUEUE, type ClassifyJob } from './classify.queue';

interface AttemptRow {
  id: string;
  level: number;
  message: string;
  inbox_email: string | null;
  blocked_by: 'input_guard' | 'output_filter' | 'egress_filter' | null;
  leaked: boolean;
}

@Injectable()
export class ClassifyProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(ClassifyProcessor.name);
  private worker?: Worker<ClassifyJob>;
  private connection?: Redis;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(AGENT_CLIENT) private readonly agent: AgentClient,
    private readonly budget: BudgetService,
    private readonly play: PlayService,
    private readonly live: LeaderboardGateway,
  ) {}

  onModuleInit(): void {
    if (!this.env.CLASSIFY_WORKER) return;
    this.connection = bullConnection(this.env);
    this.worker = new Worker<ClassifyJob>(CLASSIFY_QUEUE, (job) => this.process(job.data.attemptId), {
      connection: this.connection,
      concurrency: this.env.CLASSIFY_CONCURRENCY,
    });
    this.worker.on('failed', (job, err) => this.onFailed(job, err));
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.connection?.quit().catch(() => undefined);
  }

  /** Labels one attempt and writes the labels back. Throws to let BullMQ retry. */
  async process(attemptId: string): Promise<void> {
    const attempt = await this.load(attemptId);
    if (!attempt) return; // deleted since: nothing to do

    const res = await this.agent.classify({
      message: attempt.message,
      level: attempt.level,
      blockedBy: attempt.blocked_by,
      leaked: attempt.leaked,
      ...(attempt.inbox_email ? { inboxEmail: attempt.inbox_email } : {}),
    });
    await this.pool.query('UPDATE attempts SET techniques = $2, classify_conf = $3 WHERE id = $1', [
      attemptId,
      res.techniques,
      res.confidence,
    ]);
    await this.budget.record(this.play.estimateCost(res.usage));
    this.live.attempt({ level: attempt.level, techniques: res.techniques, blockedBy: attempt.blocked_by, leaked: attempt.leaked });
  }

  private async load(attemptId: string): Promise<AttemptRow | undefined> {
    const { rows } = await this.pool.query<AttemptRow>(
      'SELECT id, level, message, inbox_email, blocked_by, leaked FROM attempts WHERE id = $1',
      [attemptId],
    );
    return rows[0];
  }

  /** After the last retry, still show the attempt in the live feed, unlabelled. */
  private async onFailed(job: Job<ClassifyJob> | undefined, err: Error): Promise<void> {
    if (!job) return;
    this.log.warn(`classify attempt ${job.data.attemptId} failed (try ${job.attemptsMade}): ${err.message}`);
    if (job.attemptsMade < (job.opts.attempts ?? 1)) return;
    const attempt = await this.load(job.data.attemptId).catch(() => undefined);
    if (attempt) this.live.attempt({ level: attempt.level, techniques: [], blockedBy: attempt.blocked_by, leaked: attempt.leaked });
  }
}
