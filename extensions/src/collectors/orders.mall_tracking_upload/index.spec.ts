import { describe, expect, it } from 'vitest';
import { isRuntimeError, RuntimeError } from '../../core/errors';
import type { CollectedChunk, CollectFinish } from '../collector';
import { collectorFor } from '../index';
import { mallTrackingUploadCollector, type MallTrackingUploader, type MallTrackingUploadSite } from './index';

const PLAN = {
  channelAccountId: '11111111-1111-4111-8111-111111111111',
  mallKey: 'onch',
  trackingOperationId: '22222222-2222-4222-8222-222222222222',
  rows: [
    { orderNo: 'O-1', trackingNumber: 'INV-1', courier: '1136' },
    { orderNo: 'O-2', trackingNumber: 'INV-2', courier: '1136' },
    { orderNo: 'O-3', trackingNumber: 'INV-3', courier: '1136' },
    { orderNo: 'O-4', trackingNumber: 'INV-4', courier: '1136' },
  ],
};
const RESULTS = [
  { orderNo: 'O-1', status: 'uploaded' as const, mallMessage: null },
  { orderNo: 'O-2', status: 'already_uploaded' as const, mallMessage: '이미 송장 등록됨' },
  { orderNo: 'O-3', status: 'not_in_list' as const, mallMessage: '목록에 없음' },
  { orderNo: 'O-4', status: 'failed' as const, mallMessage: '응답 500' },
];

function router(uploader: MallTrackingUploader | null) {
  const asked: string[] = [];
  const site: MallTrackingUploadSite = {
    uploader(mallKey) {
      asked.push(mallKey);
      return uploader;
    },
  };
  return { site, asked };
}

async function run(site: MallTrackingUploadSite, plan: Record<string, unknown> = PLAN) {
  const chunks: CollectedChunk[] = [];
  const stream = mallTrackingUploadCollector.collect(plan as never, site, { signal: new AbortController().signal, tabId: null }) as AsyncGenerator<CollectedChunk, CollectFinish | void>;
  for (;;) {
    const step = await stream.next();
    if (step.done) return { chunks, finish: step.value ?? null };
    chunks.push(step.value);
  }
}

describe('collectors/orders.mall_tracking_upload', () => {
  it('kind 이름으로 등록되고 몰 송장 업로드 라우터 사이트를 쓴다', () => {
    expect(collectorFor('orders.mall_tracking_upload')).toBe(mallTrackingUploadCollector);
    expect(mallTrackingUploadCollector.site).toBe('mall-tracking');
  });

  it('plan 몰의 업로더로 plan 행을 보내고 행 결과를 upload_results 청크와 상태별 합계 result로 낸다', async () => {
    const sent: unknown[] = [];
    const { site, asked } = router({ async uploadTracking(rows) { sent.push(rows); return { rows: RESULTS, confirmedByMall: true }; } });
    const { chunks, finish } = await run(site);
    expect(asked).toEqual(['onch']);
    expect(sent).toEqual([PLAN.rows]);
    expect(chunks).toEqual([{ chunkKind: 'upload_results', payload: RESULTS, progress: { uploaded: 1, alreadyUploaded: 1, notInList: 1, failed: 1 } }]);
    expect(finish).toEqual({ result: { uploaded: 1, alreadyUploaded: 1, notInList: 1, failed: 1, rows: RESULTS } });
  });

  it('몰이 제출만 확인해 주면(키드키즈 출고완료) reconciling으로 멈춘다(운영자가 몰에서 확인해 confirm/close)', async () => {
    const { site } = router({ async uploadTracking() { return { rows: [RESULTS[0]!], confirmedByMall: false }; } });
    const { finish } = await run(site, { ...PLAN, mallKey: 'kidkids' });
    expect(finish).toEqual({ outcome: 'reconciling', result: { uploaded: 1, alreadyUploaded: 0, notInList: 0, failed: 0, rows: [RESULTS[0]] } });
  });

  it('로그인 같은 사이트 오류는 그대로 올린다', async () => {
    const login = new RuntimeError('SITE_LOGIN_REQUIRED', '온채널 로그인이 필요합니다.');
    const { site } = router({ async uploadTracking() { throw login; } });
    await expect(run(site)).rejects.toBe(login);
  });

  it('plan이 틀리거나 업로더가 없는 몰이면 몰에 가지 않고 RUNTIME_PLAN_INVALID', async () => {
    const bad = await run(router(null).site, { ...PLAN, rows: [] }).then(() => null, (caught: unknown) => caught);
    expect(isRuntimeError(bad) && bad.code).toBe('RUNTIME_PLAN_INVALID');
    const missing = await run(router(null).site).then(() => null, (caught: unknown) => caught);
    expect(isRuntimeError(missing) && missing.code).toBe('RUNTIME_PLAN_INVALID');
  });
});
