import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import {
  ERROR_DEFINITIONS,
  FieldErrorSchema,
  isKiditemError,
  resolveErrorCode,
  type ErrorResponse,
  type FieldError,
  type KiditemErrorCode,
} from '@kiditem/shared/errors';
import {
  FactConflictError,
  FactInputError,
  FactNotFoundError,
  FactReferenceError,
} from '../errors/fact-errors';
import { OperationInProgressDetailsSchema } from '@kiditem/shared/operation';
import { UNKNOWN_CONSTRAINT_REASON } from '../validation/validation-pipe';

/** 필터가 예외에서 뽑은 것. 봉투 조립은 `toEnvelope` 한 곳에서. */
export interface MappedError {
  code: KiditemErrorCode;
  /** 등록 코드가 아니라 status 기본 코드로 떨어졌을 때 원래 HTTP status를 지킨다. */
  statusCode?: number;
  /** 운영자 문장 후보. 한글이 없으면 레지스트리 문장으로 바뀐다. */
  message?: unknown;
  details?: Record<string, unknown>;
  errors?: FieldError[];
}

const HANGUL = /[가-힣]/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MACHINE_CODE = /^[A-Za-z][A-Za-z0-9_:.-]{0,99}$/;

/**
 * ADR-0023 봉투의 유일한 조립 지점. 모든 예외가 `{ statusCode, code, kind, message, errors, details? }`
 * 하나로 나간다. 원문·스택·변수명은 응답에 싣지 않고 `Logger`로만 남긴다. 다른 필터(채널·상품·소싱)는
 * 자기 예외를 `KiditemError`로 바꿔 여기로 위임한다.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const body = toEnvelope(mapException(exception));

    const cause = isKiditemError(exception) && exception.cause instanceof Error ? exception.cause : undefined;
    const raw = [exception, cause].filter(Boolean).map(describe).join(' ← ');
    // 봉투는 등록된 details 키만 싣는다. 진단값(details 전체, 문자열 cause)은 로그 줄에 남긴다.
    const diagnostics = isKiditemError(exception) ? describeDiagnostics(exception.details, exception.cause) : '';
    const line = `${request.method} ${request.url} → ${body.statusCode} ${body.code} (${raw})${diagnostics}`;
    const stack = (cause ?? exception) instanceof Error ? ((cause ?? exception) as Error).stack : undefined;
    if (body.statusCode >= 500) this.logger.error(line, stack);
    else this.logger.warn(line);

    response.status(body.statusCode).json(body);
  }
}

function describeDiagnostics(details: Readonly<Record<string, unknown>> | undefined, cause: unknown): string {
  const parts: string[] = [];
  if (details && Object.keys(details).length > 0) parts.push(`details=${safeJson(details)}`);
  if (cause !== undefined && !(cause instanceof Error)) parts.push(`cause=${typeof cause === 'string' ? cause : safeJson(cause)}`);
  return parts.length ? ` ${parts.join(' ')}` : '';
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function describe(value: unknown): string {
  return value instanceof Error ? `${value.name}: ${value.message}` : String(value);
}

export function toEnvelope(mapped: MappedError): ErrorResponse {
  const definition = ERROR_DEFINITIONS[mapped.code];
  const details = pickDetails(mapped.details);
  const message = typeof mapped.message === 'string' && HANGUL.test(mapped.message) ? mapped.message.trim() : definition.text;
  return {
    statusCode: mapped.statusCode ?? definition.httpStatus,
    code: mapped.code,
    kind: definition.kind,
    message,
    errors: mapped.errors ?? [],
    ...(details ? { details } : {}),
    // 확장이 최상위 attemptId를 읽는다(KID-338이 옮기면 제거).
    ...(typeof details?.attemptId === 'string' ? { attemptId: details.attemptId } : {}),
  };
}

/**
 * 봉투에 싣는 구조 데이터. 등록된 키만 통과: `attemptId`(UUID), `existing`(중복 거절이 가리키는 기존 항목),
 * `reason`(기계 코드), `operationId`(UUID), 그리고 `OPERATION_IN_PROGRESS`가 이름 붙이는 실행
 * (`OperationInProgressDetailsSchema` 통째로, ADR-0025). 그 밖의 키는 버린다.
 */
function pickDetails(source: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!source) return undefined;
  const details: Record<string, unknown> = {};
  const running = OperationInProgressDetailsSchema.safeParse(pickKeys(source, OPERATION_IN_PROGRESS_KEYS));
  if (running.success) Object.assign(details, running.data);
  if (typeof source.operationId === 'string' && UUID.test(source.operationId)) details.operationId = source.operationId;
  if (typeof source.attemptId === 'string' && UUID.test(source.attemptId)) details.attemptId = source.attemptId;
  if (source.existing && typeof source.existing === 'object') details.existing = source.existing;
  if (typeof source.reason === 'string' && MACHINE_CODE.test(source.reason)) details.reason = source.reason;
  return Object.keys(details).length ? details : undefined;
}

const OPERATION_IN_PROGRESS_KEYS = Object.keys(OperationInProgressDetailsSchema.shape);

function pickKeys(source: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(keys.filter((key) => key in source).map((key) => [key, source[key]]));
}

export function mapException(exception: unknown): MappedError {
  if (isKiditemError(exception)) {
    return { code: exception.code, message: exception.message, details: exception.details ? { ...exception.details } : undefined };
  }
  if (exception instanceof HttpException) return mapHttpException(exception);
  if (isPrismaError(exception)) {
    const code = (exception as { code?: unknown }).code;
    return { code: code === 'P2025' ? 'DB_NOT_FOUND' : code === 'P2002' ? 'DB_CONFLICT' : 'DB_ERROR' };
  }
  if (exception instanceof FactNotFoundError) return { code: 'NOT_FOUND', message: exception.message };
  if (exception instanceof FactConflictError) {
    return withRawCode(exception.details?.code, 'DB_CONFLICT', { message: exception.message, details: { attemptId: exception.details?.attemptId } });
  }
  if (exception instanceof FactReferenceError) return withRawCode(exception.code, 'VALIDATION_FAILED', { message: exception.message });
  if (exception instanceof FactInputError) return { code: 'VALIDATION_FAILED', message: exception.message };
  return { code: 'INTERNAL_ERROR' };
}

/** 원래 코드가 등록 코드로 풀리면 그것(정의표 status), 아니면 기본 코드에 원래 코드를 `details.reason`으로. */
function withRawCode(raw: unknown, fallback: KiditemErrorCode, rest: Omit<MappedError, 'code'>): MappedError {
  const code = resolveErrorCode(raw);
  if (code) return { ...rest, code };
  const reason = typeof raw === 'string' && MACHINE_CODE.test(raw.trim()) ? raw.trim() : undefined;
  return { ...rest, code: fallback, details: { ...(reason ? { reason } : {}), ...rest.details } };
}

function mapHttpException(exception: HttpException): MappedError {
  const status = exception.getStatus();
  const response = exception.getResponse();
  const body = typeof response === 'object' && response !== null ? (response as Record<string, unknown>) : {};
  const message = typeof response === 'string' ? response : body.message;

  const errors = fieldErrors(body.errors) ?? (Array.isArray(message) ? legacyFieldErrors(message) : undefined);
  if (errors) return { code: 'VALIDATION_FAILED', errors, details: body };

  // 코드 후보: 본문 `code`, 없으면 코드처럼 생긴 문장(`UnauthorizedException('auth_required')`).
  const rawCode = typeof body.code === 'string' ? body.code : typeof message === 'string' && MACHINE_CODE.test(message) ? message : undefined;
  const code = resolveErrorCode(rawCode);
  if (code) return { code, message, details: body };
  const reason = typeof body.reason === 'string' ? body.reason : rawCode && MACHINE_CODE.test(rawCode) ? rawCode : undefined;
  return { code: fallbackCode(status), statusCode: status, message, details: { ...body, reason } };
}

function fallbackCode(status: number): KiditemErrorCode {
  switch (status) {
    case 400: return 'VALIDATION_FAILED';
    case 401: return 'AUTH_REQUIRED';
    case 403: return 'FORBIDDEN';
    case 404: return 'NOT_FOUND';
    case 405: return 'METHOD_NOT_ALLOWED';
    case 409: return 'STATE_CONFLICT';
    case 429: return 'RATE_LIMITED';
    case 503: return 'SERVICE_UNAVAILABLE';
    case 504: return 'REQUEST_TIMEOUT';
    default: return status < 500 ? 'VALIDATION_FAILED' : 'INTERNAL_ERROR';
  }
}

function fieldErrors(value: unknown): FieldError[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const parsed = value.map((item) => FieldErrorSchema.safeParse(item));
  return parsed.every((item) => item.success) ? parsed.map((item) => item.data!) : undefined;
}

/** 기본 ValidationPipe의 영어 문장 배열("sku should not be empty") → 필드 이름만 살린다. */
function legacyFieldErrors(messages: unknown[]): FieldError[] {
  return messages.map((item) => {
    const field = typeof item === 'string' ? item.trim().split(/\s+/)[0] : '';
    return { field: field || '(unknown)', reason: UNKNOWN_CONSTRAINT_REASON };
  });
}

function isPrismaError(exception: unknown): boolean {
  const name = (exception as { constructor?: { name?: unknown } } | null)?.constructor?.name;
  return typeof name === 'string' && name.startsWith('PrismaClient');
}
