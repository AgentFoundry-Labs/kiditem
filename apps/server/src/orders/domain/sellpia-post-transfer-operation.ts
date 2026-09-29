import type { OperationStagedChunk } from '@kiditem/shared/operation';
import {
  SELLPIA_POST_TRANSFER_CHUNK_KIND,
  SellpiaPostTransferResultSchema,
  SellpiaPostTransferScopeSchema,
  SellpiaPostTransferStepSchema,
  type SellpiaPostTransferResult,
} from '@kiditem/shared/orders-action-operations';
import { parseActionInput, readActionChunkItems, uniqueOrderNumbers } from './orders-action-operation-input';

/** 후처리 scope는 비어 있다(대상 없이 화면 전체, 옛 규칙). */
export function sellpiaPostTransferScope(scope: unknown): Record<string, never> {
  parseActionInput(SellpiaPostTransferScopeSchema, scope, 'invalid_scope');
  return {};
}

/**
 * `post_transfer_steps` → result. 단계는 등록(`register`)·재고매칭(`stockmatch`)이고, 같은 단계가 여러 번이면 마지막 보고가
 * 이긴다. 보고되지 않은 단계는 하지 않은 것이다. `invoiceTargetCount`는 owner가 자동송장 대상 규칙으로 센 값.
 */
export function sellpiaPostTransferResult(
  chunks: readonly OperationStagedChunk[],
  invoiceTargetCount: number,
): SellpiaPostTransferResult {
  const reported = readActionChunkItems(chunks, SELLPIA_POST_TRANSFER_CHUNK_KIND, SellpiaPostTransferStepSchema);
  const register = reported.filter((step) => step.step === 'register').at(-1);
  const stockmatch = reported.filter((step) => step.step === 'stockmatch').at(-1);
  return SellpiaPostTransferResultSchema.parse({
    registered: register?.done ?? false,
    stockMatched: stockmatch?.done ?? false,
    unmatchedOrderNumbers: uniqueOrderNumbers(stockmatch?.unmatchedOrderNumbers ?? []),
    invoiceTargetCount,
  });
}
