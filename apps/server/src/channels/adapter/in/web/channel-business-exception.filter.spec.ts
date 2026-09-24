import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
import { ERROR_DEFINITIONS } from '@kiditem/shared/errors';
import { ListingException } from '../../../application/exception/listing.exception';
import { ChannelBusinessExceptionFilter } from './channel-business-exception.filter';
import { ChannelListingController } from './listing/channel-listing.controller';
import { RegistrationTargetController } from './registration-target.controller';
import { RegistrationTargetExecutionController } from './registration-target-execution.controller';

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
    [ChannelInputError, 400, 'VALIDATION_FAILED'],
    [ChannelForbiddenError, 403, 'FORBIDDEN'],
    [ChannelNotFoundError, 404, 'NOT_FOUND'],
    [ChannelConflictError, 409, 'DB_CONFLICT'],
    [ChannelUnsupportedError, 501, 'CHANNELS_MALL_UNSUPPORTED'],
    [ChannelUnavailableError, 503, 'SERVICE_UNAVAILABLE'],
  ] as const)('maps %s to HTTP %i %s and keeps a Korean business sentence', (ErrorType, statusCode, code) => {
    const { host, status, json } = responseHost();
    new ChannelBusinessExceptionFilter().catch(new ErrorType('업무 요청을 처리할 수 없습니다.'), host);
    expect(status).toHaveBeenCalledWith(statusCode);
    expect(json).toHaveBeenCalledWith({
      statusCode,
      code,
      kind: ERROR_DEFINITIONS[code].kind,
      message: '업무 요청을 처리할 수 없습니다.',
      errors: [],
    });
  });

  it('replaces an English channel sentence with the registry sentence', () => {
    const { host, json } = responseHost();
    new ChannelBusinessExceptionFilter().catch(new ChannelConflictError('representative image execution changed.'), host);
    expect(json.mock.calls[0][0]).toMatchObject({ code: 'DB_CONFLICT', message: ERROR_DEFINITIONS.DB_CONFLICT.text });
  });

  it('keeps the collection catalog identity refusal (ListingException, KID-338) readable as VALIDATION_FAILED', () => {
    const { host, json } = responseHost();
    new ChannelBusinessExceptionFilter().catch(new ListingException('invalid', '수집 상품 식별자가 비어 있거나 중복되었습니다.'), host);
    expect(json.mock.calls[0][0]).toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED', kind: 'validation' });
  });

  it('is registered once globally in main.ts, so channel controllers carry no local copy', () => {
    const main = readFileSync(resolve(__dirname, '../../../../main.ts'), 'utf8');
    expect(main).toMatch(/useGlobalFilters\(new GlobalExceptionFilter\(\), new ChannelBusinessExceptionFilter\(\)\)/);
    for (const controller of [ChannelListingController, RegistrationTargetController, RegistrationTargetExecutionController]) {
      expect(Reflect.getMetadata('__exceptionFilters__', controller), controller.name).toBeUndefined();
    }
  });

  it('resolves the owner code, keeps the attempt identity and drops private context', () => {
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
      code: 'ATTEMPT_IN_PROGRESS',
      kind: 'in_progress',
      message: '이미 실행 중입니다.',
      errors: [],
      details: { attemptId },
      attemptId,
    });
  });

  it('an unregistered owner code stays readable as details.reason', () => {
    const { host, json } = responseHost();
    new ChannelBusinessExceptionFilter().catch(new ChannelInputError({ code: 'ambiguous_listing', message: '반영할 몰 상품을 골라 주세요.' }), host);
    expect(json.mock.calls[0][0]).toEqual({
      statusCode: 400,
      code: 'VALIDATION_FAILED',
      kind: 'validation',
      message: '반영할 몰 상품을 골라 주세요.',
      errors: [],
      details: { reason: 'ambiguous_listing' },
    });
  });
});
