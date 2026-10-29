import { BadGatewayException, HttpException, Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { PG_POOL } from '../db/db.module';
import { LevelsService } from '../levels/levels.service';
import { BudgetService } from '../ratelimit/budget.service';
import { RateLimitService } from '../ratelimit/ratelimit.service';
import { AGENT_CLIENT, type AgentChatResponse, type AgentClient } from './agent.client';
import { detectLeak } from './leak-detection';

export interface AttemptInput {
  message: string;
  inboxEmail?: string;
}

export interface AttemptResult {
  attemptId: string;
  reply: string;
  toolCalls: AgentChatResponse['toolCalls'];
  blockedBy: AgentChatResponse['blockedBy'];
}

@Injectable()
export class PlayService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(AGENT_CLIENT) private readonly agent: AgentClient,
    private readonly levels: LevelsService,
    private readonly limiter: RateLimitService,
    private readonly budget: BudgetService,
  ) {}

  estimateCost(usage: AgentChatResponse['usage']): number {
    return (usage.inputTokens * this.env.PRICE_INPUT_PER_MTOK + usage.outputTokens * this.env.PRICE_OUTPUT_PER_MTOK) / 1_000_000;
  }

  async attempt(playerId: string, level: number, input: AttemptInput, ipHash: string | null): Promise<AttemptResult> {
    // Budget first: while the agent is resting, nobody burns their rate-limit quota.
    await this.budget.assertAvailable();
    await this.limiter.consumeAttempt(playerId, ipHash);
    await this.levels.assertPlayable(playerId, level);
    const secret = await this.levels.ensureSecret(playerId, level);
    const history = await this.levels.history(playerId, level);

    let res: AgentChatResponse;
    try {
      res = await this.agent.chat(level, { secret, history, message: input.message, ...(input.inboxEmail ? { inboxEmail: input.inboxEmail } : {}) });
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new BadGatewayException('Agent service error');
    }

    const costUsd = this.estimateCost(res.usage);
    await this.budget.record(costUsd);

    const leaked = detectLeak(secret, res.reply, res.toolCalls);
    const { rows } = await this.pool.query<{ id: string }>(
      `INSERT INTO attempts
         (player_id, level, message, inbox_email, reply, tool_calls, blocked_by, leaked,
          input_tokens, output_tokens, cost_usd, latency_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [
        playerId,
        level,
        input.message,
        input.inboxEmail ?? null,
        res.reply,
        JSON.stringify(res.toolCalls),
        res.blockedBy,
        leaked,
        res.usage.inputTokens,
        res.usage.outputTokens,
        costUsd,
        res.latencyMs,
      ],
    );

    await this.levels.appendHistory(playerId, level, [
      { role: 'user', content: input.message },
      { role: 'assistant', content: res.reply },
    ]);

    // TODO(step 7): enqueue the classify job for rows[0].id.
    return { attemptId: String(rows[0].id), reply: res.reply, toolCalls: res.toolCalls, blockedBy: res.blockedBy };
  }
}
