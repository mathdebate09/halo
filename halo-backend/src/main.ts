import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module.js';
import { loadEnv } from './config.js';

async function bootstrap() {
  const env = loadEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(env));
  app.set('trust proxy', 1); // Heroku router
  app.useBodyParser('json', { limit: '1mb' });
  app.enableShutdownHooks();
  await app.listen(env.PORT);
}
await bootstrap();
