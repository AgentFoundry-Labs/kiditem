import 'reflect-metadata';
import { type ArgumentsHost, Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ChannelConflictError,
  ChannelForbiddenError,
  ChannelInputError,
  ChannelNotFoundError,
  ChannelUnavailableError,
  ChannelUnsupportedError,
} from '../../../domain/exception/channel-business-error';
import { ChannelBusinessExceptionFilter } from './channel-business-exception.filter';
import { ChannelListingController } from './listing/channel-listing.controller';

function responseHost() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ method: 'POST', url: '/api/channels/listings' }),
      getResponse: () => ({ status }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('ChannelBusinessExceptionFilter HTTP contract', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it.each([
    [ChannelInputError, 400],
    [ChannelForbiddenError, 403],
    [ChannelNotFoundError, 404],
    [ChannelConflictError, 409],
    [ChannelUnsupportedError, 501],
    [ChannelUnavailableError, 503],
  ] as const)('maps %s to HTTP %i with the original business message', (ErrorType, statusCode) => {
    const { host, status, json } = responseHost();
    new ChannelBusinessExceptionFilter().catch(new ErrorType('업무 요청을 처리할 수 없습니다.'), host);
    expect(status).toHaveBeenCalledWith(statusCode);
    expect(json).toHaveBeenCalledWith({
      statusCode,
      error: `HTTP_${statusCode}`,
      message: '업무 요청을 처리할 수 없습니다.',
      timestamp: expect.any(String),
      path: '/api/channels/listings',
    });
  });

  it('keeps the listing routes behind the HTTP exception mapping', () => {
    const filters = Reflect.getMetadata('__exceptionFilters__', ChannelListingController);
    expect(filters).toContain(ChannelBusinessExceptionFilter);
  });

  it('forwards the owner code and valid attempt identity through the shared HTTP envelope', () => {
    const { host, status, json } = responseHost();
    const attemptId = '11111111-1111-4111-8111-111111111111';
    new ChannelBusinessExceptionFilter().catch(new ChannelConflictError({
      code: 'ATTEMPT_IN_PROGRESS',
      attemptId,
      message: '이미 실행 중입니다.',
      internalContext: 'not-public',
    }), host);
    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      statusCode: 409,
      error: 'HTTP_409',
      message: '이미 실행 중입니다.',
      code: 'ATTEMPT_IN_PROGRESS',
      attemptId,
      timestamp: expect.any(String),
      path: '/api/channels/listings',
    });
  });
});
