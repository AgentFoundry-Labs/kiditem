import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ZodError } from 'zod';
import { AgentOsBoundaryError } from '../../../../domain/agent-os.errors';

export async function interactionHttpCall<T>(
  work: () => T | Promise<T>,
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw mapInteractionHttpError(error);
  }
}

function mapInteractionHttpError(error: unknown): Error {
  if (error instanceof HttpException) return error;
  if (error instanceof ZodError) {
    return new BadRequestException({
      code: 'INTERACTION_REQUEST_INVALID',
      message: 'The interaction request is invalid.',
    });
  }
  if (!(error instanceof AgentOsBoundaryError)) {
    return new ServiceUnavailableException({
      code: 'INTERACTION_CONTROL_UNAVAILABLE',
      message: 'The interaction control service is unavailable.',
    });
  }

  const body = { code: error.code, message: error.message };
  if (
    error.code === 'INTERACTION_RUN_INTENT_INVALID' ||
    error.code === 'INTERACTION_RUN_INTENT_EXPIRED' ||
    error.code === 'INTERACTION_REPLAY_CURSOR_INVALID' ||
    error.code === 'INTERACTION_REPLAY_CURSOR_EXPIRED'
  ) {
    return new UnauthorizedException(body);
  }
  if (
    error.code === 'INTERACTION_CONNECTION_NOT_AUTHORIZED' ||
    error.code === 'INTERACTION_NAVIGATION_NOT_AUTHORIZED' ||
    error.code === 'INTERACTION_PRINCIPAL_NOT_ALLOWED' ||
    error.code === 'INTERACTION_REPLAY_CURSOR_MISMATCH'
  ) {
    return new ForbiddenException(body);
  }
  if (
    error.code.includes('CONFLICT') ||
    error.code.includes('MISMATCH') ||
    error.code.includes('STATE_INVALID')
  ) {
    return new ConflictException(body);
  }
  if (
    error.code.includes('NOT_CONFIGURED') ||
    error.code.includes('AMBIGUOUS') ||
    error.code.includes('REGISTRY_UNAVAILABLE') ||
    error.code.includes('REPOSITORY_UNAVAILABLE')
  ) {
    return new ServiceUnavailableException(body);
  }
  return new BadRequestException(body);
}
