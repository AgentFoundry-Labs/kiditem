import { AD_ACTION_EVIDENCE_CHUNK_KIND, AD_ACTION_KIND, AdActionEvidenceSchema, AdActionResultSchema } from '@kiditem/shared/advertising-operations';
import { describe, expect, it } from 'vitest';
import { RuntimeError } from '../../core/errors';
import type { CollectedChunk, CollectFinish } from '../collector';
import { collectorFor } from '../index';
import { adActionCollector, type AdActionSite } from './index';

const ACTION = '3b6f7c2e-8a1d-4e5f-9c0b-1a2b3c4d5e6f';
const PLAN = {
  actionId: ACTION,
  channelAccountId: '5f0c2f7e-7a9e-4f3f-9d61-0a4b2b8f1c11',
  vendorId: 'A00057379',
  actionType: 'create_campaign',
  createCampaign: { name: '봄 신상 캠페인', adGroupName: '봄 그룹', productIds: ['91000011'], dailyBudget: 50000, targetRoas: 350 },
  startedAt: '2026-09-29T00:00:00.000Z',
};

/** 가짜 광고센터 사이트(tetris 캠페인 목록 모양 `{id, name}`). 캠페인 등록은 `submit`이 정한다. */
function fakeSite(options: {
  vendorId?: string;
  roster?: Array<Array<{ id: number; name: string }>>;
  submit?: () => Promise<{ campaignId: string | null; message: string | null; url: string | null }>;
} = {}) {
  const log: string[] = [];
  let rosterReads = 0;
  const site: AdActionSite = {
    async readVendorId() {
      log.push('vendor');
      return options.vendorId ?? 'A00057379';
    },
    async listCampaigns(page) {
      log.push(`roster ${page}`);
      const pages = options.roster ?? [[{ id: 501, name: '상시 캠페인' }]];
      rosterReads += 1;
      return pages[Math.min(rosterReads - 1, pages.length - 1)] ?? [];
    },
    async release({ error }) {
      log.push(`release ${error ? (error as RuntimeError).code : 'ok'}`);
    },
    async createCampaign(input, createOptions) {
      await createOptions?.onFilled?.();
      log.push(`create ${input.name} ${input.productIds.join(',')} ${input.dailyBudget} ${input.targetRoas}`);
      return options.submit ? options.submit() : { campaignId: '88123', message: '등록되었습니다', url: 'https://advertising.coupang.com/marketing/campaign/88123/detail' };
    },
  };
  return { site, log };
}

async function drain(plan: unknown, site: AdActionSite, reports: Array<Record<string, unknown>> = []) {
  const chunks: CollectedChunk[] = [];
  const report = async (progress: Record<string, unknown>) => {
    reports.push(progress);
  };
  const stream = adActionCollector.collect(plan as never, site, { signal: new AbortController().signal, tabId: null, report })[Symbol.asyncIterator]() as AsyncIterator<CollectedChunk, CollectFinish | void>;
  for (;;) {
    const step = await stream.next();
    if (step.done) return { chunks, finish: step.value as CollectFinish };
    chunks.push(step.value);
  }
}

describe('advertising.ad_action — 승인된 캠페인 등록을 광고센터에 적용(KID-386)', () => {
  it('이 kind는 광고센터 사이트로 등록된다', () => {
    expect(collectorFor(AD_ACTION_KIND)).toBe(adActionCollector);
    expect(adActionCollector.site).toBe('ad-center');
  });

  it('업체코드를 대조하고 같은 이름 캠페인이 없으면 등록해, 증거 청크 하나와 created 결과를 낸다', async () => {
    const { site, log } = fakeSite();

    const { chunks, finish } = await drain(PLAN, site);

    expect(log).toEqual(['vendor', 'roster 0', 'create 봄 신상 캠페인 91000011 50000 350', 'release ok']);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].chunkKind).toBe(AD_ACTION_EVIDENCE_CHUNK_KIND);
    expect(AdActionEvidenceSchema.parse(chunks[0].payload[0])).toMatchObject({ campaignId: '88123', campaignName: '봄 신상 캠페인', message: '등록되었습니다' });
    expect(AdActionResultSchema.parse(finish.result)).toEqual({
      actionId: ACTION, actionType: 'create_campaign', providerOutcome: 'created', campaignId: '88123', message: '등록되었습니다', linkedExisting: false,
    });
  });

  it('업체·목록 확인 뒤와 폼을 다 채운 뒤 progress를 올려 임대를 연장한다(채우기가 몇 분 걸린다)', async () => {
    const { site } = fakeSite();
    const reports: Array<Record<string, unknown>> = [];

    await drain(PLAN, site, reports);

    expect(reports.map((progress) => progress.phase)).toEqual(['checked', 'filled', 'pressed']);
  });

  it('같은 이름 캠페인이 이미 있으면 만들지 않고 그 번호로 created(다시 시도한 실행이 캠페인을 두 번 만들지 않게)', async () => {
    const { site, log } = fakeSite({ roster: [[{ id: 777, name: '봄 신상 캠페인' }]] });

    const { chunks, finish } = await drain(PLAN, site);

    expect(log).not.toContain(expect.stringMatching(/^create/));
    expect(log.at(-1)).toBe('release ok');
    expect(chunks[0].payload[0]).toMatchObject({ campaignId: '777' });
    // 팝업이 새로 만든 것과 따로 센다(result.linkedExisting).
    expect(AdActionResultSchema.parse(finish.result)).toMatchObject({
      providerOutcome: 'created', campaignId: '777', linkedExisting: true, message: '같은 이름의 캠페인이 이미 있어 새로 만들지 않았습니다.',
    });
  });

  it('완료를 눌렀는데 번호를 못 읽으면 캠페인 목록을 다시 읽어 이름으로 찾는다', async () => {
    const { site } = fakeSite({
      roster: [[{ id: 501, name: '상시 캠페인' }], [{ id: 501, name: '상시 캠페인' }, { id: 902, name: '봄 신상 캠페인' }]],
      submit: async () => ({ campaignId: null, message: null, url: null }),
    });

    const { finish } = await drain(PLAN, site);

    expect(finish.result).toMatchObject({ providerOutcome: 'created', campaignId: '902' });
  });

  it('완료를 눌렀는데 번호도 목록도 확인하지 못하면 성공 finish의 uncertain(사람이 광고센터에서 확인)', async () => {
    const { site } = fakeSite({ submit: async () => ({ campaignId: null, message: '등록 화면에 검증 문구가 남아 있습니다.', url: null }) });

    const { chunks, finish } = await drain(PLAN, site);

    expect(chunks[0].payload[0]).toMatchObject({ campaignId: null, message: '등록 화면에 검증 문구가 남아 있습니다.' });
    expect(finish.outcome ?? 'succeeded').toBe('succeeded');
    expect(finish.result).toMatchObject({ providerOutcome: 'uncertain', campaignId: null, message: '등록 화면에 검증 문구가 남아 있습니다.' });
  });

  it('업체코드가 다르면 등록 폼에 가지 않고 계정 불일치로 멈춘다', async () => {
    const { site, log } = fakeSite({ vendorId: 'A99999999' });

    const error = await drain(PLAN, site).then(() => null, (caught: unknown) => caught);

    expect(error).toBeInstanceOf(RuntimeError);
    expect((error as RuntimeError).code).toBe('ADVERTISING_IDENTITY_MISMATCH');
    // 실패해도 사이트가 연 탭을 넘기거나 닫게 끝을 알린다.
    expect(log).toEqual(['vendor', 'release ADVERTISING_IDENTITY_MISMATCH']);
  });

  it('계획이 계약과 다르면 광고센터에 가지 않는다', async () => {
    const { site, log } = fakeSite();

    const error = await drain({ ...PLAN, actionType: 'change_bid' }, site).then(() => null, (caught: unknown) => caught);

    expect((error as RuntimeError).code).toBe('RUNTIME_PLAN_INVALID');
    expect(log).toEqual([]);
  });

  it('실패(누르기 전)면 실패 finish의 result는 not_attempted', () => {
    const result = adActionCollector.failureResult!(PLAN, { code: 'ADVERTISING_AD_CENTER_FORM_CHANGED', message: '광고센터 등록 화면이 바뀌었습니다.' }, { progress: { phase: 'filled' } });

    expect(AdActionResultSchema.parse(result)).toEqual({
      actionId: ACTION, actionType: 'create_campaign', providerOutcome: 'not_attempted', campaignId: null, message: '광고센터 등록 화면이 바뀌었습니다.', linkedExisting: false,
    });
  });

  it('누른 뒤의 실패(증거 청크 쓰기 오류 등)는 not_attempted가 아니라 uncertain — 캠페인이 생겼을 수 있다', () => {
    const result = adActionCollector.failureResult!(PLAN, { code: 'SITE_REQUEST_FAILED', message: '쓰기 실패' }, { progress: { phase: 'pressed' } });

    expect(AdActionResultSchema.parse(result)).toMatchObject({ providerOutcome: 'uncertain', campaignId: null });
  });

  it('계획을 읽지 못한 실패에는 result를 싣지 않는다', () => {
    expect(adActionCollector.failureResult!({ actionId: 'x' }, { code: 'RUNTIME_PLAN_INVALID', message: '계획' }, { progress: null })).toBeNull();
  });
});
