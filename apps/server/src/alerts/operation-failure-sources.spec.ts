import { describe, expect, it } from 'vitest';
import { sourceLabel } from '@kiditem/shared/errors';
import { OPERATION_FAILURE_KINDS, operationFailureHref } from './operation-failure-sources';

describe('옮긴 kind의 실패 알림 표', () => {
  it('kind마다 한국어 원천 이름과 화면 주소가 있다 — 이름이 없으면 제목이 "수집 실패"로 뭉개진다', () => {
    expect(OPERATION_FAILURE_KINDS.length).toBe(29);
    for (const kind of OPERATION_FAILURE_KINDS) {
      expect(sourceLabel(kind), kind).not.toBe('수집');
      expect(sourceLabel(kind), kind).not.toMatch(/[A-Za-z]/);
      expect(operationFailureHref(kind), kind).toMatch(/^\/[a-z]/);
    }
  });
});
