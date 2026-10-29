import { BadGatewayException, GatewayTimeoutException, Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import type { HistoryMessage } from '../levels/levels.service';

export const AGENT_CLIENT = Symbol('AGENT_CLIENT');

export interface AgentChatRequest {
  secret: string;
  history: HistoryMessage[];
  message: string;
  inboxEmail?: string;
}

const agentChatResponseSchema = z.object({
  reply: z.string(),
  toolCalls: z.array(z.object({ name: z.string(), args: z.record(z.string(), z.unknown()), blocked: z.boolean() })),
  blockedBy: z.enum(['input_guard', 'output_filter', 'egress_filter']).nullable(),
  usage: z.object({ inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative() }),
  latencyMs: z.number().int().nonnegative(),
});

export type AgentChatResponse = z.infer<typeof agentChatResponseSchema>;

export interface AgentClient {
  chat(level: number, body: AgentChatRequest): Promise<AgentChatResponse>;
}

@Injectable()
export class HttpAgentClient implements AgentClient {
  constructor(@Inject(ENV) private readonly env: Env) {}

  async chat(level: number, body: AgentChatRequest): Promise<AgentChatResponse> {
    let res: Response;
    try {
      res = await fetch(`${this.env.AGENT_URL}/levels/${level}/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.env.AGENT_TIMEOUT_MS),
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'TimeoutError') {
        throw new GatewayTimeoutException('The agent took too long to answer');
      }
      throw new BadGatewayException('Agent service unreachable');
    }
    if (!res.ok) throw new BadGatewayException(`Agent service error (${res.status})`);

    const parsed = agentChatResponseSchema.safeParse(await res.json());
    if (!parsed.success) throw new BadGatewayException('Agent service returned an unexpected response');
    return parsed.data;
  }
}
