import {
  WING_ITEMWINNER_CHUNK_KIND,
  WING_ITEMWINNER_KIND,
  WING_ITEMWINNER_PAGE_CHUNK_KIND,
  type WingItemwinnerPage,
  type WingItemwinnerRow,
} from '@kiditem/shared/advertising-operations';
import { z } from 'zod';
import { RuntimeError } from '../../core/errors';
import { ChunkBuffer } from '../chunk-items';
import type { CollectedChunk, Collector } from '../collector';
import { registerCollector } from '../index';

/** 이 수집기가 Wing에서 쓰는 것(`sites/wing/itemwinner.ts`의 `wing-itemwinner`가 구현, 입구가 넘긴다). */
export interface WingItemwinnerSite {
  /** 판매중 상품 전체(최대 1,000개)의 아이템위너 상태. 완결 검증은 사이트가 한다. */
  readItemwinnerList(): Promise<{ rows: WingItemwinnerRow[]; totalSize: number }>;
}

const WingItemwinnerPlanSchema = z.object({
  channelAccountId: z.string().uuid(),
  businessDate: z.string().date(),
});
export type WingItemwinnerPlan = z.infer<typeof WingItemwinnerPlanSchema>;

const RUNTIME_PLAN_INVALID = 'RUNTIME_PLAN_INVALID' as const;
const CHUNK_ITEMS = 500;

/**
 * `advertising.wing_itemwinner`(KID-362): Wing 아이템위너 목록을 한 번 읽어 `itemwinner_rows` 청크(500개씩)와
 * 응답 표식 {totalSize, observedAt} 하나를 낸다. 완결·업무일 판정과 listing 맞춤은 서버 finalize가 한다.
 */
export const wingItemwinnerCollector: Collector<WingItemwinnerPlan, Record<string, unknown>, WingItemwinnerSite> = {
  kind: WING_ITEMWINNER_KIND,
  site: 'wing-itemwinner',
  async *collect(rawPlan, site, { signal }) {
    if (!WingItemwinnerPlanSchema.safeParse(rawPlan).success) {
      throw new RuntimeError(RUNTIME_PLAN_INVALID, '아이템위너 수집 계획이 올바르지 않습니다.', { kind: WING_ITEMWINNER_KIND });
    }
    if (!site) throw new RuntimeError(RUNTIME_PLAN_INVALID, 'Wing 사이트를 쓸 수 없습니다.', { kind: WING_ITEMWINNER_KIND });
    if (signal.aborted) return;
    const list = await site.readItemwinnerList();
    const observedAt = new Date().toISOString();
    if (signal.aborted) return;
    const buffer = new ChunkBuffer<WingItemwinnerRow>({ maxItems: CHUNK_ITEMS, label: '아이템위너 행' });
    for (const row of list.rows) {
      const full = buffer.push(row);
      if (full) yield rowsChunk(full);
    }
    const rest = buffer.flush();
    if (rest) yield rowsChunk(rest);
    const marker: WingItemwinnerPage = { totalSize: list.totalSize, observedAt };
    yield { chunkKind: WING_ITEMWINNER_PAGE_CHUNK_KIND, payload: [marker], progress: { rows: list.rows.length } };
  },
};

function rowsChunk(payload: WingItemwinnerRow[]): CollectedChunk {
  return { chunkKind: WING_ITEMWINNER_CHUNK_KIND, payload };
}

registerCollector(wingItemwinnerCollector);
