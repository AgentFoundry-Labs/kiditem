import { BadRequestException, ValidationPipe, type ValidationError } from '@nestjs/common';
import type { FieldError } from '@kiditem/shared/errors';

/**
 * class-validator 제약 이름 → 운영자에게 보이는 한국어 이유(ADR-0023). 모르는 제약은 "올바르지 않습니다".
 * 영어 기본 문장은 응답에 싣지 않는다.
 */
const CONSTRAINT_REASONS: Readonly<Record<string, string>> = {
  isDefined: '값이 필요합니다.',
  isNotEmpty: '비어 있을 수 없습니다.',
  isNotEmptyObject: '비어 있을 수 없습니다.',
  arrayNotEmpty: '하나 이상 필요합니다.',
  isString: '문자열이어야 합니다.',
  isNumber: '숫자여야 합니다.',
  isNumberString: '숫자여야 합니다.',
  isInt: '정수여야 합니다.',
  isPositive: '0보다 커야 합니다.',
  isBoolean: '참/거짓 값이어야 합니다.',
  isArray: '목록이어야 합니다.',
  isObject: '객체여야 합니다.',
  isEnum: '허용된 값이 아닙니다.',
  isIn: '허용된 값이 아닙니다.',
  isUUID: '올바른 ID 형식이 아닙니다.',
  isDate: '날짜 형식이 아닙니다.',
  isDateString: '날짜 형식이 아닙니다.',
  isISO8601: '날짜 형식이 아닙니다.',
  isUrl: '주소(URL) 형식이 아닙니다.',
  isEmail: '이메일 형식이 아닙니다.',
  matches: '형식이 올바르지 않습니다.',
  min: '너무 작습니다.',
  max: '너무 큽니다.',
  minLength: '너무 짧습니다.',
  maxLength: '너무 깁니다.',
  length: '길이가 맞지 않습니다.',
  arrayMinSize: '항목이 너무 적습니다.',
  arrayMaxSize: '항목이 너무 많습니다.',
  arrayUnique: '중복된 항목이 있습니다.',
  whitelistValidation: '허용되지 않는 항목입니다.',
  nestedValidation: '올바르지 않습니다.',
};
export const UNKNOWN_CONSTRAINT_REASON = '올바르지 않습니다.';

const SECRET_FIELD = /password|secret|token|cookie|credential/i;

/** 입력값 중 봉투에 되돌려도 되는 것만: 원시값(문자열은 100자까지), 비밀 필드는 뺀다. */
function echoValue(field: string, value: unknown): { value?: unknown } {
  if (SECRET_FIELD.test(field)) return {};
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return { value };
  if (typeof value === 'string') return { value: value.slice(0, 100) };
  return {};
}

export function toFieldErrors(errors: readonly ValidationError[], parent = ''): FieldError[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own = Object.keys(error.constraints ?? {}).map((constraint) => ({
      field,
      ...echoValue(field, error.value),
      reason: CONSTRAINT_REASONS[constraint] ?? UNKNOWN_CONSTRAINT_REASON,
    }));
    return [...own, ...toFieldErrors(error.children ?? [], field)];
  });
}

/** 전역 ValidationPipe의 실패를 `VALIDATION_FAILED` + `errors[]` 봉투 재료로 바꾼다. */
export function validationExceptionFactory(errors: readonly ValidationError[]): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED', errors: toFieldErrors(errors) });
}

/** `main.ts`와 HTTP 스펙이 같은 설정을 쓴다. */
export function createGlobalValidationPipe(): ValidationPipe {
  return new ValidationPipe({ whitelist: true, transform: true, exceptionFactory: (errors) => validationExceptionFactory(errors) });
}
