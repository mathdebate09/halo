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
