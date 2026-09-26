import { describe, expect, it } from 'vitest';
import { OPERATION_CHUNK_MAX_BYTES } from '@kiditem/shared/operation';
import { isRuntimeError } from '../../core/errors';
import type { CollectedChunk } from '../collector';
import { collectorFor } from '../index';
import { sellpiaInventoryCollector, type SellpiaInventoryRow, type SellpiaInventorySite } from './index';

const row = (index: number): SellpiaInventoryRow => ({
  productCode: `P${String(index).padStart(6, '0')}`,
  optionCode: '1',
  name: `상품 ${index} ${'이름'.repeat(40)}`,
  optionName: '블루',
  barcode: `88${String(index).padStart(11, '0')}`,
  currentStock: index,
  purchasePrice: 1_000,
  salePrice: 2_000,
});

function fakeSellpia(rows: SellpiaInventoryRow[]) {
  let calls = 0;
  const site: SellpiaInventorySite = {
    async inventory() {
      calls += 1;
      return { rows };
    },
  };
  return { site, calls: () => calls };
}

async function collectAll(plan: Record<string, unknown>, site: SellpiaInventorySite) {
  const chunks: CollectedChunk[] = [];
  for await (const chunk of sellpiaInventoryCollector.collect(plan as never, site, { signal: new AbortController().signal, tabId: null })) chunks.push(chunk);
  return chunks;
}

const PLAN = { parserVersion: 'sellpia-inventory-v1', sourceOrigin: 'https://kiditem.sellpia.com', sourceAccountKey: 'kiditem', trigger: null };

describe('collectors/products.sellpia_inventory', () => {
  it('kind 이름으로 등록되고 sellpia 사이트를 쓴다', () => {
    expect(collectorFor('products.sellpia_inventory')).toBe(sellpiaInventoryCollector);
    expect(sellpiaInventoryCollector.site).toBe('sellpia');
  });

  it('목록을 한 번 읽어 머리(줄 수) 하나 + 상품 줄을 inventory_rows 청크로 내고, 청크는 1MiB 안이다', async () => {
    const rows = Array.from({ length: 12_000 }, (_, index) => row(index));
    const sellpia = fakeSellpia(rows);
    const chunks = await collectAll(PLAN, sellpia.site);
    expect(sellpia.calls()).toBe(1);
    expect(chunks.length).toBeGreaterThan(1);
    expect(new Set(chunks.map((chunk) => chunk.chunkKind))).toEqual(new Set(['inventory_rows']));
    for (const chunk of chunks) {
      expect(new TextEncoder().encode(JSON.stringify(chunk.payload)).byteLength).toBeLessThanOrEqual(OPERATION_CHUNK_MAX_BYTES);
    }
    const items = chunks.flatMap((chunk) => chunk.payload);
    expect(items[0]).toEqual({ source: 'sellpia_product_search', version: 1, rowCount: 12_000 });
    expect(items.slice(1)).toEqual(rows);
    expect(chunks.at(-1)?.progress).toEqual({ rows: 12_000 });
  });

  it('plan이 틀리면 읽지 않고 RUNTIME_PLAN_INVALID', async () => {
    const sellpia = fakeSellpia([row(1)]);
    const error = await collectAll({ parserVersion: 'v0' }, sellpia.site).then(() => null, (caught: unknown) => caught);
    expect(isRuntimeError(error) && error.code).toBe('RUNTIME_PLAN_INVALID');
    expect(sellpia.calls()).toBe(0);
  });
});
