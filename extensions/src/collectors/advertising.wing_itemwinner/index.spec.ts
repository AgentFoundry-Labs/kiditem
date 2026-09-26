import { describe, expect, it } from 'vitest';
import type { WingItemwinnerRow } from '@kiditem/shared/advertising-operations';
import type { CollectedChunk } from '../collector';
import { collectorFor } from '../index';
import { RuntimeError } from '../../core/errors';
import { wingItemwinnerCollector, type WingItemwinnerSite } from './index';

const ACCOUNT = '5f0c2f7e-7a9e-4f3f-9d61-0a4b2b8f1c11';
const PLAN = { channelAccountId: ACCOUNT, vendorId: 'A0001', businessDate: '2026-09-26' };

function row(vendorItemId: string): WingItemwinnerRow {
  return { vendorItemId, productName: '상품', isWinner: true, myPrice: 1000, winnerPrice: 900, salesQty: 1, suppressed: false, providerWinnerStatus: true };
}
function site(rows: WingItemwinnerRow[], vendorId = 'A0001', reads: string[] = []): WingItemwinnerSite {
  return {
    readVendorId: async () => { reads.push('vendor'); return vendorId; },
    readItemwinnerList: async () => { reads.push('list'); return { rows, totalSize: rows.length }; },
  };
}
async function collectAll(plan: unknown, wing: WingItemwinnerSite | null, signal = new AbortController().signal) {
  const chunks: CollectedChunk[] = [];
  for await (const chunk of wingItemwinnerCollector.collect(plan as never, wing as never, { signal, tabId: null })) chunks.push(chunk);
  return chunks;
}

describe('collectors/advertising.wing_itemwinner — Wing 아이템위너 한 번 읽기', () => {
  it('kind 이름으로 등록되고 wing-itemwinner 사이트를 쓴다', () => {
    expect(collectorFor('advertising.wing_itemwinner')).toBe(wingItemwinnerCollector);
    expect(wingItemwinnerCollector.site).toBe('wing-itemwinner');
  });

  it('행을 itemwinner_rows 청크로 내고 마지막에 응답 표식 {totalSize, observedAt}을 낸다', async () => {
    const chunks = await collectAll(PLAN, site([row('1'), row('2')]));
    expect(chunks.map((chunk) => chunk.chunkKind)).toEqual(['itemwinner_rows', 'itemwinner_page']);
    expect(chunks[0]!.payload).toEqual([row('1'), row('2')]);
    const marker = chunks[1]!.payload[0] as { totalSize: number; observedAt: string; vendorId: string };
    expect(marker.totalSize).toBe(2);
    expect(marker.vendorId).toBe('A0001');
    expect(Number.isFinite(Date.parse(marker.observedAt))).toBe(true);
    expect(chunks[1]!.progress).toEqual({ rows: 2 });
  });

  it('Wing이 0개라고 답하면 행 청크 없이 표식만 낸다(빈 목록도 완결)', async () => {
    const chunks = await collectAll(PLAN, site([]));
    expect(chunks.map((chunk) => chunk.chunkKind)).toEqual(['itemwinner_page']);
    expect(chunks[0]!.payload[0]).toMatchObject({ totalSize: 0 });
  });

  it('로그인한 Wing 세션의 업체코드를 먼저 읽고, plan 계정과 다르면 목록을 읽지 않고 멈춘다', async () => {
    const reads: string[] = [];
    await expect(collectAll(PLAN, site([row('1')], 'B0002', reads))).rejects.toMatchObject({ code: 'WING_VENDOR_IDENTITY_MISMATCH' });
    expect(reads).toEqual(['vendor']);
  });

  it('plan이 틀리거나 사이트가 없으면 멈추고, 중단되면 아무것도 내지 않는다', async () => {
    await expect(collectAll({}, site([]))).rejects.toBeInstanceOf(RuntimeError);
    await expect(collectAll(PLAN, null)).rejects.toBeInstanceOf(RuntimeError);
    const aborted = new AbortController();
    aborted.abort();
    expect(await collectAll(PLAN, site([row('1')]), aborted.signal)).toEqual([]);
  });
});
