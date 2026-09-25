import { describe, expect, it } from 'vitest';
import { isRuntimeError } from '../../core/errors';
import type { CollectedChunk } from '../collector';
import { collectorFor } from '../index';
import { sellpiaShipmentTrackingCollector, type SellpiaShipmentTrackingSite } from './index';

const PLAN = { startDate: '2026-09-07', endDate: '2026-09-08' };
const row = (index: number) => ({ ordNo: `ORDER-${index}`, itemNo: '', invNo: `INV-${index}`, courier: '1136', provider: '스마트스토어', receiver: '홍길동', post: '06000', addr: '서울' });

function fakeSellpia(rows: ReturnType<typeof row>[]) {
  const asked: Array<{ startDate: string; endDate: string }> = [];
  const site: SellpiaShipmentTrackingSite = {
    async shipmentTracking(input) {
      asked.push(input);
      return { rows, total: rows.length + 1 };
    },
  };
  return { site, asked };
}

async function collectAll(plan: Record<string, unknown>, site: SellpiaShipmentTrackingSite) {
  const chunks: CollectedChunk[] = [];
  for await (const chunk of sellpiaShipmentTrackingCollector.collect(plan as never, site, { signal: new AbortController().signal, tabId: null })) chunks.push(chunk);
  return chunks;
}

describe('collectors/orders.sellpia_shipment_tracking', () => {
  it('kind 이름으로 등록되고 sellpia 사이트를 쓴다', () => {
    expect(collectorFor('orders.sellpia_shipment_tracking')).toBe(sellpiaShipmentTrackingCollector);
    expect(sellpiaShipmentTrackingCollector.site).toBe('sellpia');
  });

  it('plan 기간을 한 번 조회해 500줄씩 tracking_rows 청크로 내고 progress에 줄 수를 싣는다', async () => {
    const sellpia = fakeSellpia(Array.from({ length: 1_201 }, (_, index) => row(index)));
    const chunks = await collectAll(PLAN, sellpia.site);
    expect(sellpia.asked).toEqual([PLAN]);
    expect(chunks.map((chunk) => [chunk.chunkKind, chunk.payload.length])).toEqual([
      ['tracking_rows', 500],
      ['tracking_rows', 500],
      ['tracking_rows', 201],
    ]);
    expect(chunks.at(-1)?.progress).toEqual({ rows: 1_201, listed: 1_202 });
    expect(chunks.flatMap((chunk) => chunk.payload)[1_200]).toEqual(row(1_200));
  });

  it('송장이 없으면 청크 없이 끝난다(서버가 rowCount 0으로 성공 처리)', async () => {
    await expect(collectAll(PLAN, fakeSellpia([]).site)).resolves.toEqual([]);
  });

  it('plan이 틀리면 조회하지 않고 RUNTIME_PLAN_INVALID', async () => {
    const sellpia = fakeSellpia([row(1)]);
    const error = await collectAll({ startDate: '2026-09-07' }, sellpia.site).then(() => null, (caught: unknown) => caught);
    expect(isRuntimeError(error) && error.code).toBe('RUNTIME_PLAN_INVALID');
    expect(sellpia.asked).toEqual([]);
  });
});
