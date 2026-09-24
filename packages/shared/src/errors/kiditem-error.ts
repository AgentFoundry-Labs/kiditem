import {
  ERROR_DEFINITIONS,
  errorDefinition,
  type ErrorDefinition,
  type ErrorKind,
  type KiditemErrorCode,
} from './definitions.js';

export interface KiditemErrorOptions {
  /** 봉투 `details`로 나가는 구조 데이터(예: `existing`, `attemptId`). 스택·원문·변수명은 넣지 않는다. */
  readonly details?: Readonly<Record<string, unknown>>;
  /** 감싼 외부 예외. 로그에만 쓰이고 응답에는 실리지 않는다. */
  readonly cause?: unknown;
  /** 운영자 문장을 문맥에 맞게 바꿔야 할 때만. 기본은 레지스트리 문장. 반드시 한국어. */
  readonly message?: string;
}

/**
 * 업무 흐름을 이어갈 수 없는 지점(도메인·어댑터)에서 던지는 오류. code는 레지스트리 키여야 하고
 * kind·httpStatus·문장은 레지스트리에서 파생된다(ADR-0023). 컨트롤러는 잡지 않고 `GlobalExceptionFilter`가
 * 봉투로 바꾼다. NestJS에 의존하지 않아 shared·웹·확장 생성기가 같은 타입을 쓴다.
 */
export class KiditemError extends Error {
  readonly code: KiditemErrorCode;
  readonly kind: ErrorKind;
  readonly httpStatus: number;
  readonly retryable: boolean;
  readonly details: Readonly<Record<string, unknown>> | undefined;
  override readonly cause: unknown;

  constructor(code: KiditemErrorCode, options: KiditemErrorOptions = {}) {
    const definition = errorDefinition(code);
    super(options.message ?? definition.text);
    this.name = 'KiditemError';
    this.code = code;
    this.kind = definition.kind;
    this.httpStatus = definition.httpStatus;
    this.retryable = definition.retryable;
    this.details = options.details;
    this.cause = options.cause;
  }

  get definition(): ErrorDefinition {
    return ERROR_DEFINITIONS[this.code];
  }
}

function kindClass(name: string, kinds: readonly ErrorKind[]) {
  return class extends KiditemError {
    constructor(code: KiditemErrorCode, options: KiditemErrorOptions = {}) {
      super(code, options);
      this.name = name;
      if (!kinds.includes(this.kind)) {
        throw new TypeError(`${name} cannot carry ${code} (kind ${this.kind}); expected ${kinds.join('|')}`);
      }
    }
  };
}

/** 요청한 항목이 없다 (404). */
export class KiditemNotFoundError extends kindClass('KiditemNotFoundError', ['not_found']) {}
/** 입력값이 규칙을 어긴다 (400). */
export class KiditemInvalidValueError extends kindClass('KiditemInvalidValueError', ['validation']) {}
/** 저장된 상태와 충돌한다 (409) — 진행 중·만료·취소 포함. */
export class KiditemConflictError extends kindClass('KiditemConflictError', ['conflict', 'in_progress', 'expired', 'cancelled']) {}
/** 먼저 갖춰야 할 조건이 없다 (422 등). */
export class KiditemPreconditionError extends kindClass('KiditemPreconditionError', ['precondition']) {}
/** 몰·Prisma·Gateway 등 바깥이 실패했다 (5xx). `cause`를 보존한다. */
export class KiditemExternalError extends kindClass('KiditemExternalError', ['external', 'internal']) {}

export function isKiditemError(value: unknown): value is KiditemError {
  return value instanceof KiditemError;
}
