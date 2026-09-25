import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ArgumentsHost,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  ERROR_DEFINITIONS,
  ErrorResponseSchema,
  KiditemConflictError,
  KiditemExternalError,
  KiditemNotFoundError,
} from '@kiditem/shared/errors';
import {
  FactConflictError,
  FactInputError,
  FactNotFoundError,
  FactReferenceError,
} from '../../errors/fact-errors';
import { GlobalExceptionFilter } from '../global-exception.filter';
import { validationExceptionFactory } from '../../validation/validation-pipe';

function makeHost(method = 'GET', url = '/api/test') {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ method, url }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

function makePrismaError(code: string, message: string) {
  return { constructor: { name: 'PrismaClientKnownRequestError' }, code, message };
}

const HANGUL = /[가-힣]/;
const ATTEMPT = '0f8fad5b-d9cb-469f-a165-70867728950e';

/** One filter run: the HTTP status it set and the body it wrote, checked against the ADR-0023 envelope. */
function envelope(exception: unknown) {
  const { host, status, json } = makeHost();
  new GlobalExceptionFilter().catch(exception, host);
  const body = json.mock.calls[0][0];
  expect(ErrorResponseSchema.parse(body)).toEqual(body);
  expect(status).toHaveBeenCalledWith(body.statusCode);
  expect(body.message).toMatch(HANGUL);
  return body;
}

describe('GlobalExceptionFilter → ADR-0023 envelope', () => {
  let logError: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    logError = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('KiditemError → its registered status, kind, sentence and details', () => {
    expect(envelope(new KiditemNotFoundError('CHANNELS_ACCOUNT_NOT_FOUND', { details: { reason: 'coupang' } }))).toEqual({
      statusCode: 404,
      code: 'CHANNELS_ACCOUNT_NOT_FOUND',
      kind: 'not_found',
      message: ERROR_DEFINITIONS.CHANNELS_ACCOUNT_NOT_FOUND.text,
      errors: [],
      details: { reason: 'coupang' },
    });
    expect(envelope(new KiditemConflictError('ATTEMPT_EXPIRED', { message: '주문 수집 시도가 만료됐습니다.' }))).toMatchObject({
      statusCode: 409, code: 'ATTEMPT_EXPIRED', kind: 'expired', message: '주문 수집 시도가 만료됐습니다.',
    });
  });

  it('409 ATTEMPT_IN_PROGRESS carries the same attempt id at the top level and in details', () => {
    const body = envelope(new ConflictException({ code: 'ATTEMPT_IN_PROGRESS', attemptId: ATTEMPT, message: 'Already running' }));
    expect(body).toEqual({
      statusCode: 409,
      code: 'ATTEMPT_IN_PROGRESS',
      kind: 'in_progress',
      message: ERROR_DEFINITIONS.ATTEMPT_IN_PROGRESS.text,
      errors: [],
      details: { attemptId: ATTEMPT },
      attemptId: ATTEMPT,
    });
  });

  it('validation pipe failures → VALIDATION_FAILED with Korean field reasons', () => {
    const exception = validationExceptionFactory([
      { property: 'name', value: 42, constraints: { isString: 'name must be a string' }, children: [] },
      {
        property: 'items',
        value: [{}],
        children: [{ property: '0', children: [{ property: 'sku', value: '', constraints: { isNotEmpty: 'sku should not be empty', madeUp: 'x' }, children: [] }] }],
      },
      { property: 'password', value: 'secret', constraints: { minLength: 'too short' }, children: [] },
    ]);
    const body = envelope(exception);
    expect(body).toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED', kind: 'validation' });
    expect(body.errors).toEqual([
      { field: 'name', value: 42, reason: '문자열이어야 합니다.' },
      { field: 'items.0.sku', value: '', reason: '비어 있을 수 없습니다.' },
      { field: 'items.0.sku', value: '', reason: '올바르지 않습니다.' },
      { field: 'password', reason: '너무 짧습니다.' },
    ]);
  });

  it('a default ValidationPipe array message still becomes field errors without the English text', () => {
    const body = envelope(new BadRequestException({ statusCode: 400, message: ['field1 should not be empty', 'field2 must be a number'], error: 'Bad Request' }));
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(body.errors).toEqual([
      { field: 'field1', reason: '올바르지 않습니다.' },
      { field: 'field2', reason: '올바르지 않습니다.' },
    ]);
  });

  it.each([
    [new NotFoundException('Cannot GET /api/nope'), 404, 'NOT_FOUND'],
    [new HttpException('Method Not Allowed', 405), 405, 'METHOD_NOT_ALLOWED'],
    [new UnauthorizedException('auth_required'), 401, 'AUTH_REQUIRED'],
    [new UnauthorizedException('no_organization_context'), 401, 'NO_ORGANIZATION_CONTEXT'],
    [new UnauthorizedException('auth_user_not_mirrored'), 401, 'AUTH_REQUIRED'],
    [new ForbiddenException('insufficient_role'), 403, 'FORBIDDEN'],
    [new BadRequestException('ATTEMPT_FENCE_LOST'), 409, 'ATTEMPT_FENCE_LOST'],
    [new ServiceUnavailableException('Authentication service unavailable'), 503, 'SERVICE_UNAVAILABLE'],
    [new HttpException('ThrottlerException: Too Many Requests', 429), 429, 'RATE_LIMITED'],
  ] as const)('HTTP exception %# → %i %s', (exception, statusCode, code) => {
    const body = envelope(exception);
    expect(body).toMatchObject({ statusCode, code, message: ERROR_DEFINITIONS[code].text });
  });

  it('keeps the wire spelling of codes the extension reads from the top-level body.code', () => {
    // content/coupang/ads-report.js:2431 reads body.code and counts EXECUTION_REPORT_MANUAL_ACTION as "직접 처리".
    const manual = envelope(new ConflictException({
      code: 'EXECUTION_REPORT_MANUAL_ACTION',
      message: '자동 실행하지 않는 액션이라 실행 보고를 받지 않았습니다. 광고센터에서 직접 처리해 주세요.',
    }));
    expect(manual).toMatchObject({
      statusCode: 409,
      code: 'EXECUTION_REPORT_MANUAL_ACTION',
      kind: 'conflict',
      message: '자동 실행하지 않는 액션이라 실행 보고를 받지 않았습니다. 광고센터에서 직접 처리해 주세요.',
    });
    for (const code of ['EXECUTION_TASK_NOT_LATEST', 'EXECUTION_TASK_EXPIRED', 'EXECUTION_REPORT_INVALID_TRANSITION'] as const) {
      expect(envelope(new ConflictException({ code, message: '실행 보고를 반영할 수 없습니다.' }))).toMatchObject({ statusCode: 409, code });
    }
    // background/orders/order-collection-server-converter.js:88 stores body.code; an empty day is not a failed conversion.
    expect(envelope(new BadRequestException({ code: 'NO_NEW_ORDERS', message: '변환할 키즈노트 주문이 없습니다.' })))
      .toMatchObject({ statusCode: 400, code: 'NO_NEW_ORDERS', message: '변환할 키즈노트 주문이 없습니다.' });
  });

  it('an unregistered code falls back by status, keeps the status and moves the raw code to details.reason', () => {
    expect(envelope(new ConflictException('SOURCE_IDEMPOTENCY_KEY_REUSED'))).toEqual({
      statusCode: 409,
      code: 'STATE_CONFLICT',
      kind: 'conflict',
      message: ERROR_DEFINITIONS.STATE_CONFLICT.text,
      errors: [],
      details: { reason: 'SOURCE_IDEMPOTENCY_KEY_REUSED' },
    });
    expect(envelope(new UnprocessableEntityException({ code: 'INVALID_TRAFFIC_DATE_RANGE', internal: 'drop me' }))).toEqual({
      statusCode: 422,
      code: 'VALIDATION_FAILED',
      kind: 'validation',
      message: ERROR_DEFINITIONS.VALIDATION_FAILED.text,
      errors: [],
      details: { reason: 'INVALID_TRAFFIC_DATE_RANGE' },
    });
  });

  it('keeps a Korean owner sentence and replaces an English one', () => {
    expect(envelope(new ConflictException({ message: '초안을 지울 수 없습니다.', reason: 'has_listing' }))).toMatchObject({
      code: 'STATE_CONFLICT', message: '초안을 지울 수 없습니다.', details: { reason: 'has_listing' },
    });
    expect(envelope(new BadRequestException('Order collection expired.')).message).toBe(ERROR_DEFINITIONS.VALIDATION_FAILED.text);
  });

  it.each([
    ['P2025', 404, 'DB_NOT_FOUND'],
    ['P2002', 409, 'DB_CONFLICT'],
    ['P2003', 500, 'DB_ERROR'],
  ] as const)('Prisma %s → %i %s without the Prisma text', (prismaCode, statusCode, code) => {
    const body = envelope(makePrismaError(prismaCode, 'Invalid `prisma.product.update()` invocation\n\nRecord to update not found.'));
    expect(body).toMatchObject({ statusCode, code, message: ERROR_DEFINITIONS[code].text });
    expect(JSON.stringify(body)).not.toMatch(/prisma|Record/);
  });

  it.each([
    [new FactNotFoundError('One or more SKUs were not found'), 404, 'NOT_FOUND'],
    [new FactConflictError('Already running', { code: 'ATTEMPT_IN_PROGRESS', attemptId: ATTEMPT }), 409, 'ATTEMPT_IN_PROGRESS'],
    [new FactConflictError('A completed Sellpia product collection is required', { code: 'SELLPIA_SYNC_REQUIRED' }), 409, 'SELLPIA_SYNC_REQUIRED'],
    [new FactConflictError('Rocket identity 7 was not persisted'), 409, 'DB_CONFLICT'],
    [new FactInputError('INVALID_DATE_RANGE'), 400, 'VALIDATION_FAILED'],
    [new FactReferenceError('Missing SKU', 'PURCHASE_REFERENCE_INVALID'), 400, 'SUPPLY_PURCHASE_REFERENCE_INVALID'],
    [new FactReferenceError('A product source reference is invalid', 'PRODUCT_SOURCE_REFERENCE_INVALID'), 422, 'PRODUCTS_SOURCE_REFERENCE_INVALID'],
    [new FactReferenceError('odd', 'SOMETHING_UNKNOWN'), 400, 'VALIDATION_FAILED'],
  ] as const)('fact error %# → %i %s with the registry sentence', (exception, statusCode, code) => {
    const body = envelope(exception);
    expect(body).toMatchObject({ statusCode, code, message: ERROR_DEFINITIONS[code].text });
    if (code === 'ATTEMPT_IN_PROGRESS') expect(body).toMatchObject({ attemptId: ATTEMPT, details: { attemptId: ATTEMPT } });
  });

  it('logs every KiditemError detail and a string cause, while the envelope keeps only the registered keys', () => {
    const logWarn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const body = envelope(new KiditemConflictError('STATE_CONFLICT', {
      details: { reason: 'TRANSITION_INVALID', from: 'draft', to: 'received' },
      cause: 'AI_IMAGE_MODEL',
    }));

    expect(body.details).toEqual({ reason: 'TRANSITION_INVALID' });
    const line = String(logWarn.mock.calls.at(-1)?.[0]);
    expect(line).toContain('"from":"draft"');
    expect(line).toContain('"to":"received"');
    expect(line).toContain('AI_IMAGE_MODEL');
  });

  it('anything else → 500 INTERNAL_ERROR; the raw text and stack go to the log only', () => {
    const body = envelope(new Error('Cannot read properties of undefined (reading sku)'));
    expect(body).toEqual({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      kind: 'internal',
      message: ERROR_DEFINITIONS.INTERNAL_ERROR.text,
      errors: [],
    });
    expect(logError).toHaveBeenCalledWith(expect.stringContaining('Cannot read properties'), expect.any(String));
    expect(envelope(new KiditemExternalError('AGENT_OS_GATEWAY_UNAVAILABLE', { cause: new Error('ECONNREFUSED') }))).toMatchObject({
      statusCode: 502, code: 'AGENT_OS_GATEWAY_UNAVAILABLE',
    });
    expect(envelope('a thrown string').code).toBe('INTERNAL_ERROR');
  });

  it('OPERATION_IN_PROGRESS carries the running operation; OPERATION_FENCE_LOST carries its id and reason (KID-353)', () => {
    const running = {
      operationId: ATTEMPT,
      kind: 'channels.wing_catalog',
      lockKeys: ['org'],
      startedAt: '2026-09-25T03:00:00.000Z',
      expiresAt: '2026-09-25T03:30:00.000Z',
    };
    expect(envelope(new KiditemConflictError('OPERATION_IN_PROGRESS', { details: { ...running, token: 'secret' } }))).toMatchObject({
      statusCode: 409, code: 'OPERATION_IN_PROGRESS', kind: 'in_progress', details: running,
    });
    expect(envelope(new KiditemConflictError('OPERATION_FENCE_LOST', { details: { operationId: ATTEMPT, reason: 'expired' } })).details)
      .toEqual({ operationId: ATTEMPT, reason: 'expired' });
    const malformed = envelope(new KiditemConflictError('OPERATION_IN_PROGRESS', { details: { operationId: 'x', kind: 'Bad', lockKeys: [] } }));
    expect(malformed).not.toHaveProperty('details');
  });

  it('drops an attempt id that is not a UUID', () => {
    const body = envelope(new ConflictException({ code: 'ATTEMPT_IN_PROGRESS', attemptId: 'not-a-uuid' }));
    expect(body).not.toHaveProperty('attemptId');
    expect(body).not.toHaveProperty('details');
  });
});
