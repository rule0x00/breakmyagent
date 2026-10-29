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

export const TECHNIQUES = [
  'direct_ask',
  'instruction_override',
  'roleplay_persona',
  'hypothetical_fiction',
  'encoding_obfuscation',
  'language_switch',
  'payload_splitting',
  'authority_social_engineering',
  'output_format_trick',
  'indirect_injection',
  'tool_abuse',
  'other',
] as const;

export interface AgentClassifyRequest {
  message: string;
  level: number;
  blockedBy: AgentChatResponse['blockedBy'];
  leaked: boolean;
  inboxEmail?: string;
}

const agentClassifyResponseSchema = z.object({
  techniques: z.array(z.enum(TECHNIQUES)).min(1),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
  usage: z
    .object({ inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative() })
    .default({ inputTokens: 0, outputTokens: 0 }),
});

export type AgentClassifyResponse = z.infer<typeof agentClassifyResponseSchema>;

export interface AgentClient {
  chat(level: number, body: AgentChatRequest): Promise<AgentChatResponse>;
  classify(body: AgentClassifyRequest): Promise<AgentClassifyResponse>;
}

@Injectable()
export class HttpAgentClient implements AgentClient {
  constructor(@Inject(ENV) private readonly env: Env) {}

  async chat(level: number, body: AgentChatRequest): Promise<AgentChatResponse> {
    return this.post(`/levels/${level}/chat`, body, agentChatResponseSchema);
  }

  async classify(body: AgentClassifyRequest): Promise<AgentClassifyResponse> {
    return this.post('/classify', body, agentClassifyResponseSchema);
  }

  private async post<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.env.AGENT_URL}${path}`, {
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

    const parsed = schema.safeParse(await res.json());
    if (!parsed.success) throw new BadGatewayException('Agent service returned an unexpected response');
    return parsed.data;
  }
}
