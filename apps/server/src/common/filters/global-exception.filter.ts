import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ErrorCodes } from '@kiditem/shared/errors';
import { AppException } from '@kiditem/shared/server-errors';
import {
  FactConflictError,
  FactInputError,
  FactNotFoundError,
  FactReferenceError,
} from '../errors/fact-errors';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = 500;
    let error: string = ErrorCodes.COMMON.INTERNAL;
    let message = 'Internal server error';
    // Machine-readable details an owner put on its exception, such as
    // `{ code: 'ATTEMPT_IN_PROGRESS', attemptId }`. Callers act on them, so
    // they reach the wire next to the generic fields instead of being dropped.
    const details: { code?: string; attemptId?: string } = {};

    if (exception instanceof AppException) {
      statusCode = exception.getStatus();
      error = exception.code;
      message = exception.message;
    } else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'object' && res !== null) {
        const obj = res as Record<string, unknown>;
        error = (obj.error as string) ?? `HTTP_${statusCode}`;
        message = Array.isArray(obj.message)
          ? obj.message.join(', ')
          : (obj.message as string) ?? exception.message;
        if (typeof obj.code === 'string' && obj.code.trim()) details.code = obj.code;
        if (typeof obj.attemptId === 'string' && UUID.test(obj.attemptId)) {
          details.attemptId = obj.attemptId;
        }
      } else {
        error = `HTTP_${statusCode}`;
        message = typeof res === 'string' ? res : exception.message;
      }
    } else if (
      exception &&
      (exception as Record<string, unknown>).constructor?.name ===
        'PrismaClientKnownRequestError'
    ) {
      const prismaError = exception as Record<string, unknown>;
      const code = prismaError.code as string;
      const prismaMessage = (prismaError.message as string) ?? '';
      const lastLine = prismaMessage.split('\n').filter(Boolean).pop() ?? prismaMessage;

      if (code === 'P2025') {
        statusCode = 404;
        error = ErrorCodes.COMMON.NOT_FOUND;
        message = lastLine;
      } else if (code === 'P2002') {
        statusCode = 409;
        error = ErrorCodes.COMMON.BAD_REQUEST;
        message = lastLine;
      } else {
        statusCode = 500;
        error = ErrorCodes.COMMON.DB_ERROR;
        message = lastLine;
      }
    } else if (exception instanceof FactNotFoundError) {
      statusCode = 404;
      error = 'Not Found';
      message = exception.message;
    } else if (exception instanceof FactConflictError) {
      statusCode = 409;
      error = exception.details?.code ?? 'Conflict';
      message = exception.message;
      if (exception.details) {
        details.code = exception.details.code;
        if (exception.details.attemptId && UUID.test(exception.details.attemptId)) {
          details.attemptId = exception.details.attemptId;
        }
      }
    } else if (exception instanceof FactReferenceError) {
      statusCode = 422;
      error = exception.code;
      message = exception.message;
    } else if (exception instanceof FactInputError) {
      statusCode = 400;
      error = 'Bad Request';
      message = exception.message;
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    if (typeof message !== 'string' || !message.trim()) {
      message = statusCode >= 500 ? 'Internal server error' : `HTTP ${statusCode}`;
    }

    if (statusCode >= 500) {
      this.logger.error(
        `${request.method} ${request.url} → ${statusCode} ${error}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(`${request.method} ${request.url} → ${statusCode} ${error}`);
    }

    response.status(statusCode).json({
      statusCode,
      error,
      message,
      ...details,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
