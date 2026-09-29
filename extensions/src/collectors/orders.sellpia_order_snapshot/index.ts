import {
  SELLPIA_ORDER_SNAPSHOT_CHUNK_KIND,
  SELLPIA_ORDER_SNAPSHOT_KIND,
  SELLPIA_SNAPSHOT_ROWS_MAX,
  SellpiaOrderSnapshotScopeSchema,
  type SellpiaOrderSnapshotRow,
  type SellpiaOrderSnapshotScope,
} from '@kiditem/shared/orders-action-operations';
import { RuntimeError } from '../../core/errors';
import { ChunkBuffer } from '../chunk-items';
import type { CollectedChunk, CollectFinish, Collector } from '../collector';
import { registerCollector } from '../index';

/** 화면 하나의 주문(`sites/sellpia` `snapshot.ts`). 못 읽은 화면은 `rows: null`. */
export interface SellpiaSnapshotScreen {
  source: 'pending' | 'stockmatch';
  rows: Array<{ orderNo: string; receiver: string; provider: string }> | null;
}

/** 두 화면을 다 못 읽으면 사이트가 `SITE_LOGIN_REQUIRED`를 던지고 탭을 남긴다. */
export interface SellpiaOrderSnapshotSite {
  orderSnapshot(): Promise<{ screens: SellpiaSnapshotScreen[] }>;
}

/** finish result — 행은 청크에만 있고 owner finalize가 청크와 이것을 합친다(T2와 맞춘 모양). */
type SnapshotFinishResult = { partial: boolean };

const RUNTIME_PLAN_INVALID = 'RUNTIME_PLAN_INVALID' as const;
const CHUNK_ROWS = 2_000;

/**
 * `orders.sellpia_order_snapshot`(KID-366 wave8b, 옛 워커의 셀피아 주문 스냅샷 액션): 백그라운드 새 탭에서 셀피아 대기목록·
 * 재고매칭 두 화면의 주문을 읽어 주문번호로 합친다(먼저 본 화면이 이긴다, 상한 1만). `snapshot_rows`로 내고 finish result에
 * 한 화면만 읽었는지(`partial`)를 싣는다. 읽기만 한다.
 */
export const sellpiaOrderSnapshotCollector: Collector<SellpiaOrderSnapshotScope, SnapshotFinishResult, SellpiaOrderSnapshotSite> = {
  kind: SELLPIA_ORDER_SNAPSHOT_KIND,
  site: 'sellpia',
  async *collect(rawPlan, site): AsyncGenerator<CollectedChunk, CollectFinish<SnapshotFinishResult>, undefined> {
    if (!SellpiaOrderSnapshotScopeSchema.safeParse(rawPlan ?? {}).success || !site) {
      throw new RuntimeError(RUNTIME_PLAN_INVALID, '셀피아 주문 스냅샷 계획이 올바르지 않습니다.', { kind: SELLPIA_ORDER_SNAPSHOT_KIND });
    }
    const { screens } = await site.orderSnapshot();
    const byOrderNo = new Map<string, SellpiaOrderSnapshotRow>();
    for (const screen of screens) {
      for (const row of screen.rows ?? []) {
        if (byOrderNo.size >= SELLPIA_SNAPSHOT_ROWS_MAX) break;
        if (!row.orderNo || byOrderNo.has(row.orderNo)) continue;
        byOrderNo.set(row.orderNo, { orderNo: row.orderNo, receiver: row.receiver, provider: row.provider, source: screen.source });
      }
    }
    const partial = screens.some((screen) => screen.rows === null);
    const progress = { orderCount: byOrderNo.size, partial };
    const buffer = new ChunkBuffer<SellpiaOrderSnapshotRow>({ maxItems: CHUNK_ROWS, label: '셀피아 주문 한 줄' });
    for (const row of byOrderNo.values()) {
      const full = buffer.push(row);
      if (full) yield { chunkKind: SELLPIA_ORDER_SNAPSHOT_CHUNK_KIND, payload: full, progress };
    }
    const rest = buffer.flush();
    if (rest) yield { chunkKind: SELLPIA_ORDER_SNAPSHOT_CHUNK_KIND, payload: rest, progress };
    return { result: { partial } };
  },
};

registerCollector(sellpiaOrderSnapshotCollector);
