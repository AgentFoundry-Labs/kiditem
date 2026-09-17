import { describe, it, expect, vi } from 'vitest';
import {
  ArgumentsHost,
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { AppException } from '@kiditem/shared/server-errors';
import {
  FactConflictError,
  FactInputError,
  FactNotFoundError,
} from '../../errors/fact-errors';
import { GlobalExceptionFilter } from '../global-exception.filter';

// ── Mocks ──

function makeHost(method = 'GET', url = '/api/test') {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const response = { status };
  const request = { method, url };
  return {
    host: {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
      }),
    } as unknown as ArgumentsHost,
    status,
    json,
  };
}

function makePrismaError(code: string, message: string) {
  return { constructor: { name: 'PrismaClientKnownRequestError' }, code, message };
}

// ── Tests ──

describe('GlobalExceptionFilter', () => {
  const filter = new GlobalExceptionFilter();

  it('AppException → extracts code + status + message', () => {
    const { host, status, json } = makeHost();
    filter.catch(new AppException(422, 'ORDER_NO_SELECTION', '주문을 선택하세요'), host);

    expect(status).toHaveBeenCalledWith(422);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 422,
        error: 'ORDER_NO_SELECTION',
        message: '주문을 선택하세요',
        path: '/api/test',
      }),
    );
  });

  it('HttpException (object response) → maps error field', () => {
    const { host, status, json } = makeHost();
    filter.catch(new BadRequestException('Validation failed'), host);

    expect(status).toHaveBeenCalledWith(400);
    const body = json.mock.calls[0][0];
    expect(body.error).toBe('Bad Request');
    expect(body.message).toBe('Validation failed');
  });

  it('HttpException (array message) → joins messages', () => {
    const { host, json } = makeHost();
    filter.catch(
      new BadRequestException({
        statusCode: 400,
        message: ['field1 required', 'field2 invalid'],
        error: 'Bad Request',
      }),
      host,
    );

    expect(json.mock.calls[0][0].message).toBe('field1 required, field2 invalid');
  });

  it('HttpException (object response) → passes a string code, a UUID attemptId and the message through', () => {
    const { host, status, json } = makeHost('POST', '/api/ads/ad-campaigns/attempts');
    const attemptId = '0f8fad5b-d9cb-469f-a165-70867728950e';
    filter.catch(
      new ConflictException({
        code: 'ATTEMPT_IN_PROGRESS',
        attemptId,
        message: '이미 수집 중인 시도가 있습니다.',
      }),
      host,
    );

    expect(status).toHaveBeenCalledWith(409);
    expect(json.mock.calls[0][0]).toEqual({
      statusCode: 409,
      error: 'HTTP_409',
      message: '이미 수집 중인 시도가 있습니다.',
      code: 'ATTEMPT_IN_PROGRESS',
      attemptId,
      timestamp: expect.any(String),
      path: '/api/ads/ad-campaigns/attempts',
    });
  });

  it('HttpException (object response) → keeps a code without an attempt and drops malformed extras', () => {
    const { host, json } = makeHost();
    filter.catch(new ConflictException({ code: 'ATTEMPT_PAUSED', attemptId: 'not-a-uuid' }), host);
    filter.catch(new ConflictException({ code: 42, attemptId: 7 }), host);

    const paused = json.mock.calls[0][0];
    expect(paused).toMatchObject({ statusCode: 409, error: 'HTTP_409', code: 'ATTEMPT_PAUSED' });
    expect(paused).not.toHaveProperty('attemptId');
    const malformed = json.mock.calls[1][0];
    expect(malformed).not.toHaveProperty('code');
    expect(malformed).not.toHaveProperty('attemptId');
  });

  it('HttpException without a code → leaves the body shape unchanged', () => {
    const { host, json } = makeHost();
    filter.catch(new ConflictException('SOURCE_IDEMPOTENCY_KEY_REUSED'), host);

    expect(Object.keys(json.mock.calls[0][0]).sort()).toEqual(
      ['error', 'message', 'path', 'statusCode', 'timestamp'],
    );
    expect(json.mock.calls[0][0]).toMatchObject({
      error: 'Conflict',
      message: 'SOURCE_IDEMPOTENCY_KEY_REUSED',
    });
  });

  it('HttpException (string response) → uses string as message', () => {
    const { host, status, json } = makeHost();
    filter.catch(new HttpException('Service down', 503), host);

    expect(status).toHaveBeenCalledWith(503);
    const body = json.mock.calls[0][0];
    expect(body.error).toBe('HTTP_503');
    expect(body.message).toBe('Service down');
  });

  it('PrismaClientKnownRequestError P2025 → 404 NOT_FOUND', () => {
    const { host, status, json } = makeHost();
    filter.catch(makePrismaError('P2025', 'Record not found\n\ndetail line'), host);

    expect(status).toHaveBeenCalledWith(404);
    const body = json.mock.calls[0][0];
    expect(body.error).toBe('COMMON_NOT_FOUND');
    expect(body.message).toBe('detail line');
  });

  it('PrismaClientKnownRequestError P2002 → 409 BAD_REQUEST', () => {
    const { host, status, json } = makeHost();
    filter.catch(makePrismaError('P2002', 'Unique constraint\n\nDuplicate entry'), host);

    expect(status).toHaveBeenCalledWith(409);
    const body = json.mock.calls[0][0];
    expect(body.error).toBe('COMMON_BAD_REQUEST');
    expect(body.message).toBe('Duplicate entry');
  });

  it('PrismaClientKnownRequestError other code → 500 DB_ERROR', () => {
    const { host, status, json } = makeHost();
    filter.catch(makePrismaError('P2003', 'Foreign key\n\nFK violation'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json.mock.calls[0][0].error).toBe('COMMON_DB_ERROR');
  });

  it.each([
    ['FactNotFoundError', new FactNotFoundError('One or more SKUs were not found'), new NotFoundException('One or more SKUs were not found'), 404],
    ['FactConflictError', new FactConflictError('Rocket identity 7 was not persisted'), new ConflictException('Rocket identity 7 was not persisted'), 409],
    ['FactInputError', new FactInputError('INVALID_DATE_RANGE'), new BadRequestException('INVALID_DATE_RANGE'), 400],
  ] as const)('%s → the status and body its Nest exception produced', (_name, factError, nestException, status) => {
    const fact = makeHost('GET', '/api/facts');
    const nest = makeHost('GET', '/api/facts');
    filter.catch(factError, fact.host);
    filter.catch(nestException, nest.host);

    expect(fact.status).toHaveBeenCalledWith(status);
    expect(nest.status).toHaveBeenCalledWith(status);
    const { timestamp: _factAt, ...factBody } = fact.json.mock.calls[0][0];
    const { timestamp: _nestAt, ...nestBody } = nest.json.mock.calls[0][0];
    expect(factBody).toEqual(nestBody);
    expect(factBody).toEqual({
      statusCode: status,
      error: { 404: 'Not Found', 409: 'Conflict', 400: 'Bad Request' }[status],
      message: factError.message,
      path: '/api/facts',
    });
  });

  it('fact errors are framework-free Errors that name themselves', () => {
    for (const error of [
      new FactNotFoundError('missing'),
      new FactConflictError('conflict'),
      new FactInputError('input'),
    ]) {
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(HttpException);
      expect(error.name).toBe(error.constructor.name);
    }
  });

  it('plain Error → 500 INTERNAL with error message', () => {
    const { host, status, json } = makeHost();
    filter.catch(new Error('Something broke'), host);

    expect(status).toHaveBeenCalledWith(500);
    const body = json.mock.calls[0][0];
    expect(body.error).toBe('COMMON_INTERNAL_ERROR');
    expect(body.message).toBe('Something broke');
  });

  it('plain Error with an empty message → keeps a non-empty fallback', () => {
    const { host, status, json } = makeHost();
    filter.catch(new Error(''), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json.mock.calls[0][0].message).toBe('Internal server error');
  });

  it('all responses include timestamp and path', () => {
    const { host, json } = makeHost('POST', '/api/orders');
    filter.catch(new Error('test'), host);

    const body = json.mock.calls[0][0];
    expect(body.path).toBe('/api/orders');
    expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
