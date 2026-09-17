import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Never log request/response bodies by default; per-route logging is
    // handled explicitly where safe (AUDIT/SECURITY_SPEC.md).
    logger: ['error', 'warn', 'log'],
  });

  configureApp(app);

  const config = app.get(AppConfigService);
  await app.listen(config.port);
  // eslint-disable-next-line no-console
  console.log(`Auth Foundation listening on port ${config.port}`);
}

bootstrap();
