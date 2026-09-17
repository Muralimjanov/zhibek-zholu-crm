import { publicKeyFingerprint } from './backups/backup-crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppConfigService } from './config/app-config.service';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

export const SWAGGER_PATH = 'docs';

/**
 * HTTP pipeline shared by main.ts and the real-database e2e suite, so the
 * tests exercise exactly the middleware/pipes/filters that run in
 * production instead of a hand-copied approximation.
 */
export function configureApp(app: INestApplication): void {
  const config = app.get(AppConfigService);
  const express = app as NestExpressApplication;

  // Fail at boot, not at the first login, on unsafe/invalid security config.
  void config.jwtAccessSecret;
  void config.refreshCookieSameSite;
  void config.businessTimezone;
  // Every login needs an emailed code: a deployed server without email
  // delivery would lock everybody out.
  if (!config.isLocalEnvironment && !config.isEmailConfigured) {
    throw new Error(
      'Email delivery is not configured (EMAIL_TRANSPORT=brevo + BREVO_API_KEY, or SMTP_HOST/SMTP_USER/SMTP_PASS) - login codes cannot be sent',
    );
  }
  const backupKey = config.backupPublicKeyPem;
  if (backupKey) publicKeyFingerprint(backupKey); // throws on a malformed key

  // Only trust X-Forwarded-* when a reverse proxy is explicitly configured;
  // otherwise a client could spoof its IP and bypass per-IP rate limits.
  if (config.trustProxy !== false) {
    express.set('trust proxy', config.trustProxy);
  }
  express.disable('x-powered-by');

  app.use(helmet());
  app.use(cookieParser());
  // Explicit JSON/form body size limits (AUTH_SPEC.md §15). File uploads have
  // their own limit in the multipart interceptor.
  express.useBodyParser('json', { limit: config.jsonBodyLimit });
  express.useBodyParser('urlencoded', { extended: false, limit: config.jsonBodyLimit });

  app.enableCors({
    origin: config.corsAllowedOrigins,
    credentials: true,
  });

  app.setGlobalPrefix(config.apiPrefix);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  if (config.swaggerEnabled) {
    setupSwagger(app, config);
  }
}

/**
 * Interactive API docs. Never mounted when NODE_ENV=production, regardless
 * of SWAGGER_ENABLED: a public schema is free reconnaissance for an attacker.
 */
function setupSwagger(app: INestApplication, config: AppConfigService): void {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Uluu Zhibek Zholu CRM API')
      .setDescription(
        'CRM MVP backend. Access token: `Authorization: Bearer <token>` from POST /auth/login. ' +
          'Refresh/logout use the HttpOnly refresh cookie plus the `x-csrf-token` header. ' +
          'Money values are strings in tyiyn (1 KGS = 100 tyiyn).',
      )
      .setVersion('0.2.0')
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup(`${config.apiPrefix}/${SWAGGER_PATH}`, app, document, {
    swaggerOptions: { persistAuthorization: false },
  });
}
