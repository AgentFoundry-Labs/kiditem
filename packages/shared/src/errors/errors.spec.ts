import { describe, expect, it } from 'vitest';
import {
  ERROR_CODES,
  ERROR_DEFINITIONS,
  ERROR_OWNERS,
  ErrorResponseSchema,
  EXTENSION_CODE_ALIASES,
  KIND_HTTP_STATUS,
  KiditemConflictError,
  KiditemError,
  KiditemExternalError,
  KiditemNotFoundError,
  describeOperatorError,
  isKiditemErrorCode,
  operatorErrorText,
  resolveErrorCode,
} from './index';

const HANGUL = /[가-힣]/;

describe('error registry (ADR-0023)', () => {
  it('registers every code as UPPER_SNAKE with an owner, a kind-consistent status and a Korean sentence', () => {
    expect(ERROR_CODES.length).toBeGreaterThan(30);
    expect(ERROR_DEFINITIONS.ATTEMPT_EXPIRED.httpStatus).toBe(KIND_HTTP_STATUS.expired);
    for (const code of ERROR_CODES) {
      const definition = ERROR_DEFINITIONS[code];
      expect(code, code).toMatch(/^[A-Z][A-Z0-9_]+$/);
      expect(ERROR_OWNERS, code).toContain(definition.owner);
      expect(definition.text, code).toMatch(HANGUL);
      expect(definition.text, code).not.toMatch(/[A-Za-z]{4,}/);
      expect(definition.httpStatus, code).toBeGreaterThanOrEqual(400);
      expect(definition.httpStatus, code).toBeLessThan(600);
      // an explicit httpStatus override wins over the kind default (e.g. 501 for an unsupported mall action)
      expect(Number.isInteger(definition.httpStatus), code).toBe(true);
    }
  });

  it('prefixes owner codes with the owner and leaves lifecycle codes bare', () => {
    expect(ERROR_DEFINITIONS.ATTEMPT_EXPIRED.owner).toBe('common');
    expect(ERROR_DEFINITIONS.CHANNELS_LISTING_EXECUTION_ACTIVE.owner).toBe('channels');
    expect(ERROR_DEFINITIONS.SUPPLY_SUBMISSION_RECONCILIATION_REQUIRED.owner).toBe('supply');
    // 확장이 응답 body.code를 철자 그대로 읽는 코드는 접두 없이 등록한다(ads-report.js 실행 보고 거절,
    // order-collection-server-converter.js 변환 결과). 확장 재설계(KID-338)가 옮기면 접두를 붙인다.
    const wireSpellings = new Set(['NO_NEW_ORDERS', 'EXECUTION_REPORT_MANUAL_ACTION', 'EXECUTION_TASK_NOT_LATEST', 'EXECUTION_TASK_EXPIRED', 'EXECUTION_REPORT_INVALID_TRANSITION']);
    for (const code of ERROR_CODES) {
      const { owner } = ERROR_DEFINITIONS[code];
      if (['common', 'auth', 'extension', 'inventory'].includes(owner) || wireSpellings.has(code)) continue;
      expect(code, code).toMatch(new RegExp(`^${owner.toUpperCase()}_`));
    }
  });

  it('keeps the specific Sellpia manual-match guidance the operator used to see', () => {
    expect(operatorErrorText({ code: 'sellpia_manual_match_login_required' })).toContain('열린 수동상품매칭 화면에서 로그인');
    expect(operatorErrorText({ code: 'sellpia_manual_match_timeout' })).toBe('셀피아 수동상품매칭 근거 수집 시간이 초과되었습니다.');
  });

  it('resolves registered codes, extension aliases and loose spellings, and refuses the rest', () => {
    expect(resolveErrorCode('ATTEMPT_EXPIRED')).toBe('ATTEMPT_EXPIRED');
    expect(resolveErrorCode('collection_window_owner_conflict')).toBe('COLLECTION_WINDOW_OWNER_CONFLICT');
    expect(resolveErrorCode('attempt-expired')).toBe('ATTEMPT_EXPIRED');
    expect(resolveErrorCode('sellpia_totally_unknown')).toBeNull();
    expect(resolveErrorCode('')).toBeNull();
    expect(resolveErrorCode(undefined)).toBeNull();
    for (const [alias, target] of Object.entries(EXTENSION_CODE_ALIASES)) {
      expect(isKiditemErrorCode(target), alias).toBe(true);
      expect(isKiditemErrorCode(alias), alias).toBe(false);
    }
  });
});

describe('operatorErrorText', () => {
  it('returns the registry sentence for a known code and a source-labelled generic sentence otherwise', () => {
    expect(operatorErrorText({ code: 'ATTEMPT_EXPIRED' })).toBe(ERROR_DEFINITIONS.ATTEMPT_EXPIRED.text);
    expect(operatorErrorText({ code: 'login_required', source: 'order_collection' })).toBe(ERROR_DEFINITIONS.MALL_LOGIN_REQUIRED.text);
    expect(operatorErrorText({ code: 'weird_code', source: 'coupang_wing_traffic' })).toBe('Wing 트래픽 수집 작업이 실패했습니다. 다시 시도해 주세요.');
    expect(operatorErrorText({ code: 'Ad campaign collection expired.', source: null })).toBe('수집 작업이 실패했습니다. 다시 시도해 주세요.');
    expect(describeOperatorError({ code: 'nope' })).toEqual({ code: null, text: '수집 작업이 실패했습니다. 다시 시도해 주세요.' });
  });

  it('never echoes the raw input', () => {
    const raw = 'Catalog attempt token mismatch';
    expect(operatorErrorText({ code: raw })).not.toContain(raw);
  });
});

describe('KiditemError', () => {
  it('derives kind, status and message from the registry and carries details and cause', () => {
    const cause = new Error('boom');
    const error = new KiditemExternalError('AGENT_OS_GATEWAY_UNAVAILABLE', { details: { attemptId: 'a' }, cause });
    expect(error).toBeInstanceOf(KiditemError);
    expect(error.code).toBe('AGENT_OS_GATEWAY_UNAVAILABLE');
    expect(error.kind).toBe('external');
    expect(error.httpStatus).toBe(502);
    expect(error.message).toBe(ERROR_DEFINITIONS.AGENT_OS_GATEWAY_UNAVAILABLE.text);
    expect(error.details).toEqual({ attemptId: 'a' });
    expect(error.cause).toBe(cause);
  });

  it('refuses a kind-specific subclass for a code of another kind', () => {
    expect(() => new KiditemNotFoundError('ATTEMPT_EXPIRED')).toThrow(TypeError);
    expect(new KiditemConflictError('ATTEMPT_EXPIRED').kind).toBe('expired');
  });
});

describe('ErrorResponseSchema', () => {
  it('accepts the envelope and rejects raw-message or stack fields', () => {
    const envelope = { statusCode: 409, code: 'ATTEMPT_IN_PROGRESS', kind: 'in_progress', message: '같은 수집이 이미 진행 중입니다.', errors: [] };
    expect(ErrorResponseSchema.parse(envelope)).toEqual(envelope);
    expect(ErrorResponseSchema.safeParse({ ...envelope, stack: 'x' }).success).toBe(false);
    expect(ErrorResponseSchema.safeParse({ ...envelope, error: 'HTTP_409' }).success).toBe(false);
    expect(ErrorResponseSchema.safeParse({ ...envelope, code: 'not_registered' }).success).toBe(false);
    expect(ErrorResponseSchema.parse({ ...envelope, errors: [{ field: 'name', value: '', reason: '비어 있습니다.' }] }).errors).toHaveLength(1);
  });
});
