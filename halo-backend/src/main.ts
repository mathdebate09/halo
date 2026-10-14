import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module.js';
import { loadEnv } from './config.js';

async function bootstrap() {
  const env = loadEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(env));
  app.set('trust proxy', 1); // Heroku router
  // Meal photos arrive as base64 (~0.5 MB for a 1024 px JPEG); the schema caps them at 3 MB.
  app.useBodyParser('json', { limit: '5mb' });
  app.enableShutdownHooks();
  await app.listen(env.PORT);
}
await bootstrap();
