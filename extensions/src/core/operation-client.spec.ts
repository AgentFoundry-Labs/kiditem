import { describe, expect, it } from 'vitest';
import { stopFor } from './operation-client';

describe('stopFor — 서버 거절 코드 → 런타임 행동', () => {
  it('OPERATION_IN_PROGRESS는 시작하지 않고 기존 실행을 보고한다', () => {
    expect(stopFor('OPERATION_IN_PROGRESS', { existing: { operationId: 'x' } })).toEqual({
      kind: 'already_running',
      existing: { operationId: 'x' },
    });
  });

  it.each(['expired', 'terminal', 'chunk_conflict'])('OPERATION_FENCE_LOST{%s}는 멈추고 finish를 보내지 않는다', (reason) => {
    expect(stopFor('OPERATION_FENCE_LOST', { reason })).toEqual({ kind: 'fence_lost', reason });
  });

  it('OPERATION_NOT_FOUND(토큰 불일치)도 fence_lost로 본다', () => {
    expect(stopFor('OPERATION_NOT_FOUND', null)).toEqual({ kind: 'fence_lost', reason: null });
  });

  it('그 밖의 코드는 finish(failed)로 알린다', () => {
    expect(stopFor('VALIDATION_FAILED', undefined)).toEqual({ kind: 'report_failed' });
  });
});
