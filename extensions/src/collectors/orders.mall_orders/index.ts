import {
  MALL_ORDERS_CHUNK_KIND,
  MALL_ORDERS_CONTINUATION_CHUNK_KIND,
  MALL_ORDERS_KIND,
} from '@kiditem/shared/orders-operations';
import { z } from 'zod';
import { RuntimeError } from '../../core/errors';
import { ChunkBuffer } from '../chunk-items';
import type { Collector } from '../collector';
import { registerCollector } from '../index';

/**
 * 몰 하나의 주문 읽기(`sites/<mallKey>`가 구현). `rows`는 그 몰의 옛 변환 본문에 들어가던 원소(키드키즈 주문, 아트공구
 * 행 …) 그대로이고, `continuation`은 아이스크림몰처럼 화면이 이어 쓰는 정보가 있는 몰만 준다.
 */
export interface MallOrderReader {
  readOrders(input: {
    collectionDate: string | null;
    selectionMode: 'manual' | 'automatic';
    seenRowKeys: string[];
  }): Promise<{ rows: unknown[]; continuation?: Record<string, unknown> }>;
  close?(): Promise<void>;
}

/** 이 수집기가 쓰는 사이트: 몰 키 → 그 몰 읽기(`sites/mall-orders`가 몰 사이트를 이름으로 찾아 준다). 없는 몰은 null. */
export interface MallOrdersSite {
  reader(mallKey: string): MallOrderReader | null;
}

const PlanSchema = z.object({
  mallKey: z.string().min(1),
  collectionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  selectionMode: z.enum(['manual', 'automatic']).optional(),
  seenRowKeys: z.array(z.string()).optional(),
});
export type MallOrdersPlan = z.infer<typeof PlanSchema>;

const CHUNK_ROWS = 200;
const RUNTIME_PLAN_INVALID = 'RUNTIME_PLAN_INVALID' as const;

/**
 * `orders.mall_orders`(KID-359 H3): 서버 plan의 몰 하나를 그 몰 사이트로 읽어 주문 원소를 200개씩 `order_rows` 청크로,
 * 이어받기 정보가 있으면 `continuation` 한 장으로 낸다. 보관 캡처·주문 수·변환은 서버 finalize가 한다. 주문이 없으면
 * 청크 없이 끝나고 서버가 0건으로 성공 처리한다(옛 complete-empty). 로그인·요청 실패는 사이트가 던진 오류로 끝난다.
 */
export const mallOrdersCollector: Collector<MallOrdersPlan, Record<string, unknown>, MallOrdersSite> = {
  kind: MALL_ORDERS_KIND,
  site: 'mall-orders',
  async *collect(rawPlan, site, { signal }) {
    const parsed = PlanSchema.safeParse(rawPlan);
    const reader = parsed.success && site ? site.reader(parsed.data.mallKey) : null;
    if (!parsed.success || !reader) {
      throw new RuntimeError(RUNTIME_PLAN_INVALID, '이 확장이 수집할 수 없는 몰 주문 계획입니다.', {
        kind: MALL_ORDERS_KIND,
        mallKey: parsed.success ? parsed.data.mallKey : null,
      });
    }
    const plan = parsed.data;
    try {
      const { rows, continuation } = await reader.readOrders({
        collectionDate: plan.collectionDate,
        selectionMode: plan.selectionMode ?? 'manual',
        seenRowKeys: plan.seenRowKeys ?? [],
      });
      if (signal.aborted) return;
      const progress = { mallKey: plan.mallKey, rows: rows.length };
      const buffer = new ChunkBuffer<unknown>({ maxItems: CHUNK_ROWS, label: '주문 한 건' });
      for (const row of rows) {
        const full = buffer.push(row);
        if (full) yield { chunkKind: MALL_ORDERS_CHUNK_KIND, payload: full, progress };
      }
      const rest = buffer.flush();
      if (rest) yield { chunkKind: MALL_ORDERS_CHUNK_KIND, payload: rest, progress };
      if (continuation) yield { chunkKind: MALL_ORDERS_CONTINUATION_CHUNK_KIND, payload: [continuation], progress };
    } finally {
      await reader.close?.();
    }
  },
};

registerCollector(mallOrdersCollector);
