import { describe, expect, it } from 'vitest';
import { sellpiaInventoryFreshness, sellpiaOperation } from '@/test/fixtures/sellpia-operations';
import { sellpiaInventoryState } from './sellpia-inventory-source-owner';

// 화면 상태 = 발행된 재고(Products 상태 읽기) + 최근 실행(실행 reader). 도는 실행·실패·중단은 실행이, 완료·미수집은
// 발행 상태가 말한다(KID-361 J1).
const done = (overrides = {}) => sellpiaOperation({ status: 'succeeded', finishedAt: '2026-09-26T01:01:00.000Z', ...overrides });

describe('sellpiaInventoryState', () => {
  it('도는 실행이 있으면 발행 상태와 상관없이 수집 중이다', () => {
    expect(sellpiaInventoryState(sellpiaInventoryFreshness(), { operations: [sellpiaOperation(), done()] }).status).toBe('running');
  });

  it('마지막으로 끝난 실행이 실패면 실패와 운영자 문장, 멈췄으면 중단(실패 아님)이다', () => {
    const failed = sellpiaInventoryState(sellpiaInventoryFreshness(), {
      operations: [sellpiaOperation({ status: 'failed', errorCode: 'SITE_LOGIN_REQUIRED', errorMessage: '셀피아 로그인이 필요합니다.' }), done()],
    });
    expect(failed).toMatchObject({ status: 'failed', errorMessage: '셀피아 로그인이 필요합니다.', stopped: false });

    const stopped = sellpiaInventoryState(sellpiaInventoryFreshness(), {
      operations: [sellpiaOperation({ status: 'cancelled', errorCode: 'USER_CANCELLED' }), done()],
    });
    expect(stopped).toMatchObject({ status: 'complete', errorMessage: null, stopped: true });
  });

  it('실행이 없거나 성공으로 끝났으면 발행 상태가 완료·미수집을 정하고 발행 실행 id·완료 시각을 싣는다', () => {
    expect(sellpiaInventoryState(sellpiaInventoryFreshness(), { operations: [done()] })).toEqual({
      status: 'complete',
      lastCompletedAt: '2026-09-14T00:30:00.000Z',
      lastCompletedOperationId: '99999999-9999-4999-8999-999999999999',
      errorMessage: null,
      sourceBindingConfirmed: true,
      stopped: false,
    });
    const empty = sellpiaInventoryFreshness({ verifiedGeneration: '0', lastCompletedAt: null, lastCompletedAttemptId: null });
    expect(sellpiaInventoryState(empty, undefined).status).toBe('not_collected');
  });
});
