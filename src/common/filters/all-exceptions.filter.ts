import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

/**
 * Ensures ORM errors, stack traces, and other internals never reach the
 * client (SECURITY_SPEC.md - "safe error responses"). Known HttpExceptions
 * keep their status/message (already application-controlled); anything
 * else becomes a generic 500 with an opaque code.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      response.status(status).json(
        typeof body === 'string' ? { statusCode: status, message: body } : body,
      );
      return;
    }

    // Client errors raised by Express middleware (body-parser: payload too
    // large, malformed JSON, unsupported charset...) carry an http-errors
    // status. Surface the status with a stable code, never their message.
    const clientStatus = clientErrorStatus(exception);
    if (clientStatus) {
      response.status(clientStatus).json({
        statusCode: clientStatus,
        message: clientStatus === HttpStatus.PAYLOAD_TOO_LARGE ? 'PAYLOAD_TOO_LARGE' : 'REQUEST_INVALID',
      });
      return;
    }

    this.logger.error(
      exception instanceof Error ? exception.stack : JSON.stringify(exception),
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'INTERNAL_ERROR',
    });
  }
}

function clientErrorStatus(exception: unknown): number | null {
  if (typeof exception !== 'object' || exception === null) return null;
  const e = exception as { status?: unknown; statusCode?: unknown; expose?: unknown };
  const status = typeof e.status === 'number' ? e.status : typeof e.statusCode === 'number' ? e.statusCode : null;
  return status !== null && e.expose === true && status >= 400 && status < 500 ? status : null;
}
