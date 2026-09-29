import { KiditemPreconditionError } from '@kiditem/shared/errors';
import type { OperationStagedChunk } from '@kiditem/shared/operation';
import {
  SELLPIA_AUTO_INVOICE_CHUNK_KIND,
  SELLPIA_TRANSFER_TARGETS_MAX,
  SellpiaAutoInvoicePlanSchema,
  SellpiaAutoInvoiceResultSchema,
  SellpiaAutoInvoiceScopeSchema,
  SellpiaInvoiceRowSchema,
  SellpiaOrderTransferResultSchema,
  type SellpiaAutoInvoicePlan,
  type SellpiaAutoInvoiceResult,
  type SellpiaInvoiceRow,
} from '@kiditem/shared/orders-action-operations';
import { z } from 'zod';
import {
  assertWithinTargets,
  parseActionInput,
  readActionChunkItems,
  readOperatorConfirmation,
} from './orders-action-operation-input';
import type { SellpiaInvoiceOutcomeView, SellpiaTransferOutcomeView } from './sellpia-invoice-targets';

/** 운영자 확인 본문(`confirm {result}`): 셀피아 채번 화면에서 본 발급 행. 없으면 확장이 읽은 행을 쓴다. */
export const SellpiaInvoiceOperatorConfirmationSchema = z.object({
  issued: z.array(SellpiaInvoiceRowSchema).max(SELLPIA_TRANSFER_TARGETS_MAX).optional(),
}).strict();
export type SellpiaInvoiceOperatorConfirmation = z.infer<typeof SellpiaInvoiceOperatorConfirmationSchema>;

export function sellpiaAutoInvoiceScope(scope: unknown): Record<string, never> {
  parseActionInput(SellpiaAutoInvoiceScopeSchema, scope, 'invalid_scope');
  return {};
}

/** 대상(`sellpiaInvoiceTargets`)이 없으면 시작하지 않는다 — 대기 행 전체 채번은 금지(옛 규칙). */
export function sellpiaAutoInvoicePlan(targetOrderNumbers: readonly string[]): SellpiaAutoInvoicePlan {
  if (targetOrderNumbers.length === 0) throw new KiditemPreconditionError('ORDERS_SELLPIA_INVOICE_NO_TARGETS');
  if (targetOrderNumbers.length > SELLPIA_TRANSFER_TARGETS_MAX) {
    throw new KiditemPreconditionError('ORDERS_SELLPIA_INVOICE_NO_TARGETS', { details: { reason: 'too_many_targets', count: targetOrderNumbers.length } });
  }
  return SellpiaAutoInvoicePlanSchema.parse({ targetOrderNumbers: [...targetOrderNumbers] });
}

export function readSellpiaAutoInvoicePlan(plan: unknown): SellpiaAutoInvoicePlan {
  return parseActionInput(SellpiaAutoInvoicePlanSchema, plan, 'invalid_plan');
}

export function readSellpiaInvoiceOperatorConfirmation(result: unknown): SellpiaInvoiceOperatorConfirmation | null {
  return readOperatorConfirmation(result, SellpiaInvoiceOperatorConfirmationSchema);
}

/**
 * `invoice_rows` → result. 발급 행은 모두 plan 대상 안이어야 하고(대상 밖 채번은 거절), 같은 주문은 처음 행 하나.
 * 선택한 번호는 plan 대상 전부, 그리드에 없던 번호는 발급 행이 없는 대상이다. 운영자 확인이면 그가 본 행을 쓴다.
 */
export function sellpiaAutoInvoiceResult(
  chunks: readonly OperationStagedChunk[],
  plan: SellpiaAutoInvoicePlan,
  confirmation: SellpiaInvoiceOperatorConfirmation | null,
): SellpiaAutoInvoiceResult {
  const reported = confirmation?.issued ?? readActionChunkItems(chunks, SELLPIA_AUTO_INVOICE_CHUNK_KIND, SellpiaInvoiceRowSchema);
  const issued: SellpiaInvoiceRow[] = [];
  const seen = new Set<string>();
  for (const row of reported) {
    if (seen.has(row.orderNo)) continue;
    seen.add(row.orderNo);
    issued.push(row);
  }
  assertWithinTargets([...seen], plan.targetOrderNumbers, 'issued_outside_targets');
  return SellpiaAutoInvoiceResultSchema.parse({
    issued,
    selectedOrderNumbers: plan.targetOrderNumbers,
    notFoundOrderNumbers: plan.targetOrderNumbers.filter((orderNo) => !seen.has(orderNo)),
  });
}

/** 성공한 송장 실행 result → 대상 규칙이 빼는 번호(선택한 대상 전부). 모양이 틀린 result는 null(옛 모양은 없다). */
export function sellpiaInvoiceAttempted(result: unknown): SellpiaInvoiceOutcomeView | null {
  const parsed = SellpiaAutoInvoiceResultSchema.safeParse(result);
  return parsed.success ? { attemptedOrderNumbers: parsed.data.selectedOrderNumbers } : null;
}

/** 성공한 전송 실행 result → 대상 규칙이 쓰는 받아들여진 번호. 모양이 틀린 result는 null. */
export function sellpiaTransferAccepted(result: unknown, finishedAt: Date): SellpiaTransferOutcomeView | null {
  const parsed = SellpiaOrderTransferResultSchema.safeParse(result);
  return parsed.success ? { finishedAt, acceptedOrderNumbers: parsed.data.acceptedOrderNumbers } : null;
}
