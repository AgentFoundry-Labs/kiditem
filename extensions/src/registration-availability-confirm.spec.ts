import { describe, expect, it } from 'vitest';
import type { RegistrationPlan } from '@kiditem/shared/channels-operations';
import { registrationCollector, type RegistrationSite } from './collectors/channels.registration';
import { runAvailability } from './sites/mall-write/availability';
import { availabilityHarness } from './sites/mall-write/availability.fake';
import './sites/always/availability';
import './sites/domeggook/availability';

/**
 * 품절·재개 확인을 몰 모듈의 실제 다시 읽기(`runAvailability`·`flagOption`)부터 수집기 종료까지 한 줄로 본다(KID-256 리뷰 1).
 * 리스팅 단위 몰은 판매중이면 재고를 모른다(null) — 그래도 몰이 판매중이라고 읽혔으면 재개는 확인이다.
 */
const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const LISTING = '33333333-3333-4333-8333-333333333333';
const OPTION = '55555555-5555-4555-8555-555555555555';

function plan(mallKey: string, action: 'sold_out' | 'resume', externalListingId: string): RegistrationPlan {
  return {
    executionKind: action,
    mallKey,
    channelAccountId: ACCOUNT,
    registrationTargetId: null,
    salesProductId: null,
    channelListingId: null,
    externalListingId: null,
    expectedProviderAccountId: null,
    submit: true,
    payloadHash: 'hash',
    payload: {
      action,
      listings: [{ channelListingId: LISTING, externalListingId, options: [{ salesProductOptionId: null, channelListingOptionId: OPTION, externalOptionId: externalListingId, sellerSku: null }] }],
    },
    startedAt: '2026-09-27T00:00:00.000Z',
  };
}

async function run(collectorPlan: RegistrationPlan, harness: ReturnType<typeof availabilityHarness>) {
  const site = { writer: () => ({ availability: (input: Parameters<typeof runAvailability>[2]) => runAvailability(harness.module, harness.context, input) }) } as unknown as RegistrationSite;
  const chunks: Array<{ chunkKind: string; payload: unknown[] }> = [];
  const stream = registrationCollector.collect(collectorPlan, site, { signal: new AbortController().signal, tabId: null }) as AsyncGenerator<{ chunkKind: string; payload: unknown[] }, { outcome?: string; result?: Record<string, unknown> }>;
  for (;;) {
    const step = await stream.next();
    if (step.done) return { chunks, finish: step.value };
    chunks.push(step.value);
  }
}

function domeggook(disp: string) {
  const state = { disp };
  const fetch = async (url: string, init: RequestInit = {}) => {
    if (new URL(url).pathname === '/sc/item/lst') {
      return { ok: true, status: 200, url, text: async () => JSON.stringify({ res: true, dat: [{ no: 1, disp: state.disp, title: '말랑이', loq: '1', useOpt: 'N' }] }) } as unknown as Response;
    }
    const dat = JSON.parse(decodeURIComponent(String(init.body).slice(4)));
    state.disp = dat[0].disp ? '진열함' : '진열안함';
    return { ok: true, status: 200, url, text: async () => JSON.stringify({ res: true, success: 1 }) } as unknown as Response;
  };
  return availabilityHarness({ mallKey: 'domeggook', fetch: fetch as never });
}

describe('품절·재개 확인 — 몰 다시 읽기부터 수집기 종료까지(리스팅 단위 몰)', () => {
  it('도매꾹 재개: 진열함으로 다시 읽히면 확인(succeeded)이고, 증거 상태는 몰의 말이다', async () => {
    const { chunks, finish } = await run(plan('domeggook', 'resume', '1'), domeggook('진열안함'));
    expect(finish).toMatchObject({ result: { mallOutcome: 'confirmed', providerOutcome: 'succeeded' } });
    expect(finish).not.toHaveProperty('outcome');
    expect(chunks.find((chunk) => chunk.chunkKind === 'registration_evidence')!.payload).toEqual([expect.objectContaining({ externalListingId: '1', observedStatus: '진열함' })]);
  });

  it('도매꾹 품절: 진열안함으로 다시 읽히면 확인이다', async () => {
    const { finish } = await run(plan('domeggook', 'sold_out', '1'), domeggook('진열함'));
    expect(finish).toMatchObject({ result: { mallOutcome: 'confirmed' } });
  });

  it('올웨이즈 재개: 재고를 주지 않는 몰도 판매중으로 다시 읽히면 확인이다', async () => {
    const id = '6743cacb46ae748ace9f239c';
    const item = { _id: id, soldOut: true };
    const harness = availabilityHarness({
      mallKey: 'always',
      handlers: {
        alwayzRequestOnPage: (url: string) => {
          if (url.endsWith('/sellers/items/info-request')) return { status: 200, json: { status: 200, data: [{ ...item }] } };
          item.soldOut = false;
          return { status: 200, json: { status: 200 } };
        },
      },
    });
    const { chunks, finish } = await run(plan('always', 'resume', id), harness);
    expect(finish).toMatchObject({ result: { mallOutcome: 'confirmed' } });
    expect(chunks.find((chunk) => chunk.chunkKind === 'registration_evidence')!.payload).toEqual([expect.objectContaining({ observedStatus: '판매중' })]);
  });
});
