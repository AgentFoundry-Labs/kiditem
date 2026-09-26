import { SELLPIA_SALES_CHUNK_KIND, SELLPIA_SALES_KIND } from '@kiditem/shared/sellpia-operations';
import { z } from 'zod';
import { RuntimeError } from '../../core/errors';
import { ChunkBuffer } from '../chunk-items';
import type { Collector } from '../collector';
import { registerCollector } from '../index';

/** 판매처 하나의 하루(서버 `SellpiaSalesRowSchema`와 같은 모양). */
export interface SellpiaSalesRow {
  sellerId: string;
  sellerName: string;
  date: string;
  price: number;
  amount: number;
  buyPrice: number;
}

/** 이 수집기가 셀피아에서 쓰는 것(`sites/sellpia`가 구현). `sellers`는 응답의 판매처 수. */
export interface SellpiaSalesSite {
  sales(input: { startDate: string; endDate: string }): Promise<{ rows: SellpiaSalesRow[]; sellers: number }>;
}

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const PlanSchema = z.object({
  range: z.object({ from: isoDay, to: isoDay }),
}).passthrough();
export type SellpiaSalesPlan = z.infer<typeof PlanSchema>;

const CHUNK_ROWS = 500;
const RUNTIME_PLAN_INVALID = 'RUNTIME_PLAN_INVALID' as const;

/**
 * `analytics.sellpia_sales`(KID-361 J2): 서버 plan 범위의 셀피아 판매현황을 한 번 읽어 판매처·일 줄을 500줄씩
 * `sales_rows` 청크로 낸다. 창 바꿔 쓰기·금액 자르기는 서버 finalize가 한다. 빈 판매현황이면 청크 없이 끝나고 서버가
 * 창을 매출 0으로 덮는다. 로그인·요청 실패·형식 틀림은 사이트가 던진 오류로 실행이 실패한다.
 */
export const sellpiaSalesCollector: Collector<SellpiaSalesPlan, Record<string, unknown>, SellpiaSalesSite> = {
  kind: SELLPIA_SALES_KIND,
  site: 'sellpia',
  async *collect(rawPlan, site, { signal }) {
    const parsed = PlanSchema.safeParse(rawPlan);
    if (!parsed.success) throw new RuntimeError(RUNTIME_PLAN_INVALID, '셀피아 매출 수집 계획이 올바르지 않습니다.', { kind: SELLPIA_SALES_KIND });
    if (!site) throw new RuntimeError(RUNTIME_PLAN_INVALID, '셀피아 사이트를 쓸 수 없습니다.', { kind: SELLPIA_SALES_KIND });
    const { rows, sellers } = await site.sales({ startDate: parsed.data.range.from, endDate: parsed.data.range.to });
    if (signal.aborted) return;
    const progress = { rows: rows.length, sellers };
    const buffer = new ChunkBuffer<SellpiaSalesRow>({ maxItems: CHUNK_ROWS, label: '셀피아 판매처·일 한 줄' });
    for (const row of rows) {
      const full = buffer.push(row);
      if (full) yield { chunkKind: SELLPIA_SALES_CHUNK_KIND, payload: full, progress };
    }
    const rest = buffer.flush();
    if (rest) yield { chunkKind: SELLPIA_SALES_CHUNK_KIND, payload: rest, progress };
  },
};

registerCollector(sellpiaSalesCollector);
