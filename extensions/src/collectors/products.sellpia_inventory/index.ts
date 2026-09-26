import { SELLPIA_INVENTORY_CHUNK_KIND, SELLPIA_INVENTORY_KIND } from '@kiditem/shared/sellpia-operations';
import { z } from 'zod';
import { RuntimeError } from '../../core/errors';
import { ChunkBuffer } from '../chunk-items';
import type { Collector } from '../collector';
import { registerCollector } from '../index';

/** 셀피아 상품 한 줄(서버가 옛 JSON 스냅샷 규칙 `SellpiaInventoryBrowserSnapshotRowSchema`로 본다). */
export interface SellpiaInventoryRow {
  productCode: string;
  optionCode: string;
  name: string;
  optionName: string | null;
  barcode: string | null;
  currentStock: number;
  purchasePrice: number | null;
  salePrice: number | null;
}

/** 이 수집기가 셀피아에서 쓰는 것(`sites/sellpia`가 구현). 행은 상품·옵션 코드 순이고 겹치지 않는다. */
export interface SellpiaInventorySite {
  inventory(): Promise<{ rows: SellpiaInventoryRow[] }>;
}

const PlanSchema = z.object({
  parserVersion: z.literal('sellpia-inventory-v1'),
  sourceOrigin: z.literal('https://kiditem.sellpia.com'),
  sourceAccountKey: z.literal('kiditem'),
}).passthrough();
export type SellpiaInventoryPlan = z.infer<typeof PlanSchema>;

/** 한 청크의 줄 상한(바이트 상한 1MiB가 먼저 닿으면 그쪽). */
const CHUNK_ROWS = 5_000;
const RUNTIME_PLAN_INVALID = 'RUNTIME_PLAN_INVALID' as const;

/**
 * `products.sellpia_inventory`(KID-361 J1): 셀피아 상품 목록 전체를 한 번 읽어, 머리 항목 하나(옛 JSON 스냅샷의
 * `source`·`version`·`rowCount`) 뒤에 상품 줄을 `inventory_rows` 청크로 낸다. 발행·세대는 서버 finalize가 정한다.
 * 빈 목록·로그인·요청 실패는 사이트가 던진 오류로 실행이 실패한다(옛 규칙: 빈 목록은 성공이 아니다).
 */
export const sellpiaInventoryCollector: Collector<SellpiaInventoryPlan, Record<string, unknown>, SellpiaInventorySite> = {
  kind: SELLPIA_INVENTORY_KIND,
  site: 'sellpia',
  async *collect(rawPlan, site, { signal }) {
    const parsed = PlanSchema.safeParse(rawPlan);
    if (!parsed.success) throw new RuntimeError(RUNTIME_PLAN_INVALID, '셀피아 재고 수집 계획이 올바르지 않습니다.', { kind: SELLPIA_INVENTORY_KIND });
    if (!site) throw new RuntimeError(RUNTIME_PLAN_INVALID, '셀피아 사이트를 쓸 수 없습니다.', { kind: SELLPIA_INVENTORY_KIND });
    const { rows } = await site.inventory();
    if (signal.aborted) return;
    const progress = { rows: rows.length };
    const buffer = new ChunkBuffer<unknown>({ maxItems: CHUNK_ROWS, label: '셀피아 상품 한 줄' });
    for (const item of [{ source: 'sellpia_product_search', version: 1, rowCount: rows.length }, ...rows]) {
      const full = buffer.push(item);
      if (full) yield { chunkKind: SELLPIA_INVENTORY_CHUNK_KIND, payload: full, progress };
    }
    const rest = buffer.flush();
    if (rest) yield { chunkKind: SELLPIA_INVENTORY_CHUNK_KIND, payload: rest, progress };
  },
};

registerCollector(sellpiaInventoryCollector);
