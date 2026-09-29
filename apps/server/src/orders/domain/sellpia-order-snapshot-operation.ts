import type { OperationStagedChunk } from '@kiditem/shared/operation';
import {
  SELLPIA_ORDER_SNAPSHOT_CHUNK_KIND,
  SELLPIA_SNAPSHOT_ROWS_MAX,
  SellpiaOrderSnapshotResultSchema,
  SellpiaOrderSnapshotRowSchema,
  SellpiaOrderSnapshotScopeSchema,
  type SellpiaOrderSnapshotResult,
  type SellpiaOrderSnapshotRow,
} from '@kiditem/shared/orders-action-operations';
import { z } from 'zod';
import { invalidActionInput, parseActionInput, readActionChunkItems } from './orders-action-operation-input';

/** finish 요청 `result`에서 읽는 칸: 두 화면 중 하나만 읽었는가. 청크(행 배열)에는 실을 곳이 없다. */
const SnapshotFinishSchema = z.object({ partial: z.boolean().optional() }).passthrough();

export function sellpiaOrderSnapshotScope(scope: unknown): Record<string, never> {
  parseActionInput(SellpiaOrderSnapshotScopeSchema, scope, 'invalid_scope');
  return {};
}

/**
 * `snapshot_rows` → result. 대기목록·재고매칭 두 화면의 행을 주문번호로 합친다(먼저 온 행이 이긴다). 합친 행이 상한
 * (1만)을 넘으면 잘라 버리지 않고 거절한다 — 대조가 조용히 모자라지 않게. `partial`은 finish result에서 읽는다.
 */
export function sellpiaOrderSnapshotResult(
  chunks: readonly OperationStagedChunk[],
  finishResult: unknown,
): SellpiaOrderSnapshotResult {
  const finish = parseActionInput(SnapshotFinishSchema, finishResult ?? {}, 'invalid_finish_result');
  const rows: SellpiaOrderSnapshotRow[] = [];
  const seen = new Set<string>();
  for (const row of readActionChunkItems(chunks, SELLPIA_ORDER_SNAPSHOT_CHUNK_KIND, SellpiaOrderSnapshotRowSchema)) {
    if (seen.has(row.orderNo)) continue;
    seen.add(row.orderNo);
    rows.push(row);
  }
  if (rows.length > SELLPIA_SNAPSHOT_ROWS_MAX) throw invalidActionInput('too_many_snapshot_rows', { count: rows.length, max: SELLPIA_SNAPSHOT_ROWS_MAX });
  return SellpiaOrderSnapshotResultSchema.parse({ orderCount: rows.length, rows, partial: finish.partial ?? false });
}
