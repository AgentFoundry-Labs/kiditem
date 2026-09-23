import { describe, expect, it } from 'vitest';
import type { PublishTask } from '@/app/(channels)/_shared/use-mall-publish-run';
import { registrationRunNotice } from './registration-run-notice';

function task(overrides: Partial<PublishTask>): PublishTask {
  return {
    id: 'coupang#0', mallKey: 'coupang', mallName: '쿠팡 WING', channelAccountId: 'account-1',
    items: [], values: {}, adapterValues: {}, status: 'pending', outcome: null, error: null, ...overrides,
  };
}

/** 등록 실행 한 건의 결과 문구 — 서버가 확인한 것(`succeeded`)만 등록됐다고 말한다. */
describe('registrationRunNotice', () => {
  it('says registered only when the server confirmed the execution', () => {
    expect(registrationRunNotice(task({
      status: 'succeeded',
      outcome: { ok: true, confirmed: false, submitted: true, accepted: true, productNo: '427011919', manualSteps: [], warnings: [] },
    }))).toEqual({
      tone: 'success',
      registered: true,
      title: '쿠팡 WING에 등록했어요 — 등록상품에 올렸습니다',
      description: '몰 상품번호 427011919',
    });
  });

  it('keeps a submitted but unconfirmed run open for confirmation', () => {
    const notice = registrationRunNotice(task({
      status: 'reconciling',
      outcome: { ok: false, confirmed: false, submitted: true, accepted: null, manualSteps: [], warnings: ['열린 탭에서 확인하세요.'], error: '완료 안내를 확인하지 못했습니다.' },
    }));
    expect(notice).toMatchObject({ tone: 'warning', registered: false });
    expect(notice.title).toBe('쿠팡 WING에 보냈지만 등록 확인이 남았어요');
    expect(notice.description).toContain('완료 안내를 확인하지 못했습니다.');
  });

  it('says why a run stopped', () => {
    expect(registrationRunNotice(task({ status: 'failed', error: '옵션 하나만 올립니다.' }))).toEqual({
      tone: 'error',
      registered: false,
      title: '쿠팡 WING 등록 실행이 멈췄어요',
      description: '옵션 하나만 올립니다.',
    });
  });
});
