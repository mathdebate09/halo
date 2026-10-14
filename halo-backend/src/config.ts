import { existsSync } from 'node:fs';

import { z } from 'zod';

import { appKeySchema } from './shared/index.js';

// Local dev reads halo-backend/.env (never committed); Heroku sets config vars directly.
if (existsSync('.env')) process.loadEnvFile('.env');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required (see .env.example)'),
  /** The 16-char key shared with the app (EXPO_PUBLIC_APP_KEY). */
  APP_KEY: appKeySchema,
  /** Requests per minute per device. */
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(120),
  /** DeepSeek API key. Without it the AI endpoints answer 503 and the app keeps its fallbacks. */
  DEEPSEEK_API_KEY: z.string().min(1).optional(),
  DEEPSEEK_BASE_URL: z.url().default('https://api.deepseek.com'),
  /** One model for text and images (DeepSeek vision guide). */
  DEEPSEEK_MODEL: z.string().min(1).default('deepseek-flash'),
  /** Per-attempt timeout for an AI call. */
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
  /** Jobs a device may have queued or running at once. */
  MAX_JOBS_PER_DEVICE: z.coerce.number().int().positive().default(2),
});

export type Env = z.infer<typeof envSchema>;

/** Injection token for the validated environment. */
export const ENV = Symbol('ENV');

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
