import {
  SELLPIA_SHIPMENT_TRACKING_CHUNK_KIND,
  SELLPIA_SHIPMENT_TRACKING_KIND,
} from '@kiditem/shared/orders-operations';
import { z } from 'zod';
import { RuntimeError } from '../../core/errors';
import { ChunkBuffer } from '../chunk-items';
import type { Collector } from '../collector';
import { registerCollector } from '../index';

/** 송장 한 줄(서버 `orders/domain/sellpia-shipment-tracking-operation.ts`의 모양과 같다). */
export interface SellpiaTrackingRow {
  ordNo: string;
  itemNo: string;
  invNo: string;
  courier: string;
  provider: string;
  receiver?: string;
  post?: string;
  addr?: string;
}

/** 이 수집기가 셀피아에서 쓰는 것(`sites/sellpia`가 구현). `total`은 셀피아가 준 목록 수(거른 줄 포함). */
export interface SellpiaShipmentTrackingSite {
  shipmentTracking(input: { startDate: string; endDate: string }): Promise<{ rows: SellpiaTrackingRow[]; total: number }>;
}

const PlanSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type SellpiaShipmentTrackingPlan = z.infer<typeof PlanSchema>;

const CHUNK_ROWS = 500;
const RUNTIME_PLAN_INVALID = 'RUNTIME_PLAN_INVALID' as const;

/**
 * `orders.sellpia_shipment_tracking`(KID-359 H3): 서버 plan 기간의 셀피아 송장을 한 번 조회해 500줄씩
 * `tracking_rows` 청크로 낸다. 보관 캡처와 줄 수(result.rowCount)는 서버 finalize가 만든다. 송장이 없으면 청크 없이
 * 끝나고 서버가 빈 캡처로 성공 처리한다. 로그인·요청 실패는 사이트가 던진 오류로 실행이 실패한다.
 */
export const sellpiaShipmentTrackingCollector: Collector<SellpiaShipmentTrackingPlan, Record<string, unknown>, SellpiaShipmentTrackingSite> = {
  kind: SELLPIA_SHIPMENT_TRACKING_KIND,
  site: 'sellpia',
  async *collect(rawPlan, site, { signal }) {
    const parsed = PlanSchema.safeParse(rawPlan);
    if (!parsed.success) throw new RuntimeError(RUNTIME_PLAN_INVALID, '셀피아 송장 조회 계획이 올바르지 않습니다.', { kind: SELLPIA_SHIPMENT_TRACKING_KIND });
    if (!site) throw new RuntimeError(RUNTIME_PLAN_INVALID, '셀피아 사이트를 쓸 수 없습니다.', { kind: SELLPIA_SHIPMENT_TRACKING_KIND });
    const { rows, total } = await site.shipmentTracking({ startDate: parsed.data.startDate, endDate: parsed.data.endDate });
    if (signal.aborted) return;
    const progress = { rows: rows.length, listed: total };
    const buffer = new ChunkBuffer<SellpiaTrackingRow>({ maxItems: CHUNK_ROWS, label: '셀피아 송장 한 줄' });
    for (const row of rows) {
      const full = buffer.push(row);
      if (full) yield { chunkKind: SELLPIA_SHIPMENT_TRACKING_CHUNK_KIND, payload: full, progress };
    }
    const rest = buffer.flush();
    if (rest) yield { chunkKind: SELLPIA_SHIPMENT_TRACKING_CHUNK_KIND, payload: rest, progress };
  },
};

registerCollector(sellpiaShipmentTrackingCollector);
