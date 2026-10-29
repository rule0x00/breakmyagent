import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(16),
  IP_HASH_SALT: z.string().min(8),
  AGENT_URL: z.string().url().default('http://agent:8000'),
  AGENT_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_PER_DAY: z.coerce.number().int().positive().default(150),
  RATE_LIMIT_IP_PER_MIN: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_SUBMIT_PER_MIN: z.coerce.number().int().positive().default(10),
  CLASSIFY_WORKER: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  CLASSIFY_CONCURRENCY: z.coerce.number().int().positive().default(4),
  CLASSIFY_BACKOFF_MS: z.coerce.number().int().positive().default(2000),
  DAILY_BUDGET_USD: z.coerce.number().nonnegative().default(5),
  PRICE_INPUT_PER_MTOK: z.coerce.number().nonnegative().default(0.1),
  PRICE_OUTPUT_PER_MTOK: z.coerce.number().nonnegative().default(0.5),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n  ');
    throw new Error(`Invalid environment:\n  ${issues}`);
  }
  return parsed.data;
}
