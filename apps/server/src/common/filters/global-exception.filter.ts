import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ErrorCodes } from '@kiditem/shared';
import { AppException } from '@kiditem/shared/server-errors';

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
    } else if (exception instanceof Error) {
      message = exception.message;
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
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
