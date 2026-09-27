import { describe, expect, it } from 'vitest';
import type { MallAvailabilityReadPlan } from '@kiditem/shared/channels-operations';
import { mallAvailabilityReadCollector, type MallAvailabilityReadSite } from './index';

const ACCOUNT = '11111111-1111-4111-8111-111111111111';

function plan(overrides: Partial<MallAvailabilityReadPlan> = {}): MallAvailabilityReadPlan {
  return {
    channelAccountId: ACCOUNT,
    mallKey: 'kakao',
    externalListingIds: ['1', '2', '3'],
    expectedProviderAccountId: null,
    startedAt: '2026-09-27T00:00:00.000Z',
    ...overrides,
  };
}

async function run(readPlan: MallAvailabilityReadPlan, site: MallAvailabilityReadSite) {
  const chunks: Array<{ chunkKind: string; payload: unknown[] }> = [];
  const stream = mallAvailabilityReadCollector.collect(readPlan, site, { signal: new AbortController().signal, tabId: null }) as AsyncGenerator<{ chunkKind: string; payload: unknown[] }, { result?: Record<string, unknown> } | void>;
  for (;;) {
    const step = await stream.next();
    if (step.done) return { chunks, finish: step.value ?? {} };
    chunks.push({ chunkKind: step.value.chunkKind, payload: step.value.payload });
  }
}

describe('channels.mall_availability_read — 몰 판매 상태 읽기(KID-256)', () => {
  it('리스팅 단위 몰: 읽은 상품마다 한 줄(옵션 id 없음), 판매중이면 재고 모름·팔 수 있음, 못 사면 0과 몰의 말', async () => {
    const reads: string[][] = [];
    const site: MallAvailabilityReadSite = {
      reader: () => ({
        async read(codes) {
          reads.push(codes);
          return {
            products: [
              { code: '1', options: [{ optionCode: '1', stock: 7, rocket: false }] },
              { code: '2', options: [{ optionCode: '2', stock: 0, rocket: false, state: '품절' }] },
            ],
            missing: ['3'],
          };
        },
      }),
    };
    const { chunks, finish } = await run(plan(), site);
    expect(reads).toEqual([['1', '2', '3']]);
    const rows = [
      { externalListingId: '1', externalOptionId: null, available: true, stock: 7, rocket: false, observedStatus: null, observedAt: expect.any(String) },
      { externalListingId: '2', externalOptionId: null, available: false, stock: 0, rocket: false, observedStatus: '품절', observedAt: expect.any(String) },
    ];
    expect(chunks).toEqual([{ chunkKind: 'availability_rows', payload: rows }]);
    expect(finish).toEqual({ result: { rowCount: 2, missingExternalListingIds: ['3'], rows } });
  });

  it('옵션 단위 몰(쿠팡 윙): 옵션마다 한 줄에 옵션 id와 로켓그로스 여부를 싣는다', async () => {
    const site: MallAvailabilityReadSite = {
      reader: () => ({
        read: async () => ({
          products: [{ code: '1', options: [{ optionCode: '11', stock: 0, rocket: false }, { optionCode: '12', stock: 30, rocket: true }] }],
          missing: [],
        }),
      }),
    };
    const { chunks } = await run(plan({ mallKey: 'coupang', externalListingIds: ['1'] }), site);
    expect(chunks[0]!.payload).toEqual([
      expect.objectContaining({ externalListingId: '1', externalOptionId: '11', available: false, stock: 0, rocket: false }),
      expect.objectContaining({ externalListingId: '1', externalOptionId: '12', available: true, stock: 30, rocket: true }),
    ]);
  });

  it('한 번에 50개씩 읽어 묶음마다 청크를 낸다', async () => {
    const reads: number[] = [];
    const site: MallAvailabilityReadSite = {
      reader: () => ({
        async read(codes) {
          reads.push(codes.length);
          return { products: codes.map((code) => ({ code, options: [{ optionCode: code, stock: null, rocket: false }] })), missing: [] };
        },
      }),
    };
    const ids = Array.from({ length: 120 }, (_, index) => String(index + 1));
    const { chunks, finish } = await run(plan({ externalListingIds: ids }), site);
    expect(reads).toEqual([50, 50, 20]);
    expect(chunks.map((chunk) => chunk.payload.length)).toEqual([50, 50, 20]);
    expect(finish).toMatchObject({ result: { rowCount: 120 } });
  });

  it('읽기 모듈이 없는 몰은 RUNTIME_PLAN_INVALID로 멈춘다', async () => {
    await expect(run(plan({ mallKey: 'onch' }), { reader: () => null })).rejects.toMatchObject({ code: 'RUNTIME_PLAN_INVALID' });
  });
});
