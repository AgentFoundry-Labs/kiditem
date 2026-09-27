import { describe, expect, it } from 'vitest';
import type { OperationView } from '@kiditem/shared/operation';
import { registrationTaskRow, registrationTasksPollMs } from './registration-task-rows';

function operation(patch: Partial<OperationView>): OperationView {
  return {
    id: '55555555-5555-4555-8555-555555555555', kind: 'channels.registration', status: 'succeeded', lockKeys: [],
    plan: { executionKind: 'register', mallKey: 'art09', registrationTargetId: '11111111-1111-4111-8111-111111111111', externalListingId: null },
    progress: null, result: null, window: null, errorCode: null, errorMessage: null,
    startedAt: '2026-09-27T09:00:00.000Z', finishedAt: '2026-09-27T09:01:00.000Z', expiresAt: '2026-09-27T09:30:00.000Z',
    attempts: 1, maxAttempts: 1, scheduledFor: null, ...patch,
  };
}

const fill = { steps: [], warnings: [], manualSteps: [], dialogs: [] };

describe('registrationTaskRow — 등록 실행 한 줄', () => {
  it('⭐ 확인된 등록은 몰 이름 · 종류 · 등록상품ID로 요약한다', () => {
    const row = registrationTaskRow(operation({
      result: { providerOutcome: 'succeeded', mallOutcome: 'confirmed', submitted: true, submitSkipped: null, externalListingId: '9001', mallMessage: null, fill, evidence: null },
    }));
    expect(row).toMatchObject({ mallName: '아트공구', kindLabel: '등록', stateLabel: '확인 완료', summary: '등록상품ID 9001' });
  });

  it('제출하지 않고 폼만 채운 실행은 그렇게 말한다(등록됐다고 하지 않는다)', () => {
    const row = registrationTaskRow(operation({
      result: { providerOutcome: 'not_attempted', mallOutcome: 'not_submitted', submitted: false, submitSkipped: '이 몰은 사람이 [등록]을 누릅니다.', externalListingId: null, mallMessage: null, fill, evidence: null },
    }));
    expect(row.stateLabel).toBe('폼만 채움');
    expect(row.state).toBe('filled');
    expect(row.summary).toBe('폼만 채움 — 이 몰은 사람이 [등록]을 누릅니다.');
  });

  it('⭐ 제출하지 않은 성공은 submitSkipped가 null이어도 "폼만 채움"이다 — "확인 완료"가 아니다(QA D4)', () => {
    const row = registrationTaskRow(operation({
      result: { providerOutcome: 'not_attempted', mallOutcome: 'not_submitted', submitted: false, submitSkipped: null, externalListingId: null, mallMessage: null, fill, evidence: null },
    }));
    expect(row).toMatchObject({ state: 'filled', stateLabel: '폼만 채움', summary: '폼만 채움' });
  });

  it('대상 열은 판매상품 이름, 없으면 몰 상품번호, 그것도 없으면 id 앞자리', () => {
    const named = registrationTaskRow(operation({ plan: {
      executionKind: 'register', mallKey: 'onch', registrationTargetId: '1ff29c3c-1111-4111-8111-111111111111',
      payload: { snapshot: { product: { name: '곰돌이 우산' } }, form: {} },
    } }));
    expect(named.target).toBe('곰돌이 우산');
    const listing = registrationTaskRow(operation({ plan: { executionKind: 'update', mallKey: 'kakao', externalListingId: 'MALL-7', registrationTargetId: '1ff29c3c-1111-4111-8111-111111111111' } }));
    expect(listing.target).toBe('몰 상품 MALL-7');
    const bare = registrationTaskRow(operation({ plan: { executionKind: 'register', mallKey: 'onch', registrationTargetId: '1ff29c3c-1111-4111-8111-111111111111' } }));
    expect(bare.target).toBe('1ff29c3c');
  });

  it('reconciling은 확인 필요이고, 실패는 운영자 문장이다(코드 원문 금지)', () => {
    expect(registrationTaskRow(operation({ status: 'reconciling', finishedAt: null })).stateLabel).toBe('확인 필요');
    const failed = registrationTaskRow(operation({ status: 'failed', errorCode: 'SITE_LOGIN_REQUIRED', errorMessage: 'login required' }));
    expect(failed.stateLabel).toBe('실패');
    expect(failed.summary).not.toMatch(/SITE_LOGIN_REQUIRED|login required/);
  });

  it('묶음 품절은 리스팅 수로, 모르는 몰 키는 키 그대로', () => {
    // 묶음 품절의 리스팅은 plan.payload.listings에 있다(plan에 items 칸은 없다).
    const row = registrationTaskRow(operation({ plan: { executionKind: 'sold_out', mallKey: 'unknown-mall', payload: { listings: [{}, {}, {}] } } }));
    expect(row).toMatchObject({ mallName: 'unknown-mall', kindLabel: '품절', target: '리스팅 3개' });
  });
});

describe('registrationTasksPollMs — 폴링 예산', () => {
  it('도는 실행이 있을 때만 10초마다(분당 6회), 없으면 폴링하지 않는다', () => {
    expect(registrationTasksPollMs([operation({ status: 'executing', finishedAt: null })])).toBe(10_000);
    expect(registrationTasksPollMs([operation({ status: 'reconciling', finishedAt: null })])).toBe(false);
    expect(registrationTasksPollMs([])).toBe(false);
  });
});
