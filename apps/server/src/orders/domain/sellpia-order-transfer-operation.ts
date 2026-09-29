import { KiditemConflictError, KiditemPreconditionError } from '@kiditem/shared/errors';
import type { OperationStagedChunk } from '@kiditem/shared/operation';
import {
  SELLPIA_ORDER_TRANSFER_CHUNK_KIND,
  SELLPIA_TRANSFER_TARGETS_MAX,
  SellpiaOrderTransferEvidenceSchema,
  SellpiaOrderTransferPlanSchema,
  SellpiaOrderTransferResultSchema,
  SellpiaOrderTransferScopeSchema,
  type SellpiaOrderTransferPlan,
  type SellpiaOrderTransferResult,
  type SellpiaOrderTransferScope,
  type SellpiaTransferTransport,
} from '@kiditem/shared/orders-action-operations';
import { COUPANG_DIRECTSHIP_KIND, MALL_ORDERS_KIND } from '@kiditem/shared/orders-operations';
import { z } from 'zod';
import {
  assertWithinTargets,
  invalidActionInput,
  parseActionInput,
  readActionChunkItems,
  readOperatorConfirmation,
  uniqueOrderNumbers,
} from './orders-action-operation-input';

/** 전송 원천이 될 수 있는 실행 kind: 몰 주문(수동 업로드 포함)과 쿠팡 직배송. */
export const SELLPIA_TRANSFER_SOURCE_KINDS = [MALL_ORDERS_KIND, COUPANG_DIRECTSHIP_KIND] as const;

/** 운영자 확인 본문(`confirm {result}`): 셀피아에서 본 접수 번호. 없으면 대상 전부가 접수된 것이다. */
export const SellpiaTransferOperatorConfirmationSchema = z.object({
  acceptedOrderNumbers: z.array(z.string().trim().min(1).max(200)).max(SELLPIA_TRANSFER_TARGETS_MAX).optional(),
}).strict();
export type SellpiaTransferOperatorConfirmation = z.infer<typeof SellpiaTransferOperatorConfirmationSchema>;

export function sellpiaTransferScope(scope: unknown): SellpiaOrderTransferScope {
  return parseActionInput(SellpiaOrderTransferScopeSchema, scope, 'invalid_scope');
}

export function readSellpiaTransferPlan(plan: unknown): SellpiaOrderTransferPlan {
  return parseActionInput(SellpiaOrderTransferPlanSchema, plan, 'invalid_plan');
}

/**
 * 원천 kind에 맞는 운송유형: 직배송은 운송유형마다 파일이 하나라 필수, 몰 주문에는 없어야 한다. 전송 원천이 될 수 없는
 * kind면 원천 없음(`ORDERS_TRANSFER_SOURCE_UNAVAILABLE`).
 */
export function sellpiaTransferTransport(
  sourceKind: string,
  transport: SellpiaTransferTransport | undefined,
): SellpiaTransferTransport | null {
  if (sourceKind === COUPANG_DIRECTSHIP_KIND) {
    if (!transport) throw invalidActionInput('transport_required', { sourceKind });
    return transport;
  }
  if (sourceKind === MALL_ORDERS_KIND) {
    if (transport) throw invalidActionInput('transport_not_allowed', { sourceKind });
    return null;
  }
  throw new KiditemPreconditionError('ORDERS_TRANSFER_SOURCE_UNAVAILABLE', { details: { reason: 'unsupported_source_kind', sourceKind } });
}

export function readSellpiaTransferOperatorConfirmation(result: unknown): SellpiaTransferOperatorConfirmation | null {
  return readOperatorConfirmation(result, SellpiaTransferOperatorConfirmationSchema);
}

/**
 * `transfer_evidence`(정확히 하나) → result. 성공 finish는 셀피아가 접수를 확인한 것(`submitted`)만 받는다 — 확인 못 함은
 * `reconciling`, 미접수는 실패 finish다. 운영자 확인이면 그가 본 번호(없으면 대상 전부)를 쓴다. 받아들여진 번호는 모두 plan
 * 대상 안이어야 한다 — 자동송장이 이 번호만 채번한다.
 */
export function sellpiaTransferResult(
  chunks: readonly OperationStagedChunk[],
  plan: SellpiaOrderTransferPlan,
  confirmation: SellpiaTransferOperatorConfirmation | null,
): SellpiaOrderTransferResult {
  const evidences = readActionChunkItems(chunks, SELLPIA_ORDER_TRANSFER_CHUNK_KIND, SellpiaOrderTransferEvidenceSchema);
  if (evidences.length !== 1) throw invalidActionInput('transfer_evidence_count', { count: evidences.length });
  const [evidence] = evidences;
  let accepted: string[];
  if (confirmation) {
    accepted = uniqueOrderNumbers(confirmation.acceptedOrderNumbers ?? plan.targetOrderNumbers);
  } else {
    if (evidence!.outcome !== 'submitted') throw invalidActionInput('transfer_not_confirmed', { outcome: evidence!.outcome });
    accepted = uniqueOrderNumbers(evidence!.acceptedOrderNumbers);
  }
  assertWithinTargets(accepted, plan.targetOrderNumbers, 'accepted_outside_targets');
  return SellpiaOrderTransferResultSchema.parse({
    outcome: 'submitted',
    acceptedOrderNumbers: accepted,
    targetOrderCount: plan.targetOrderNumbers.length,
  });
}

/**
 * 재전송 울타리(리더 결정, KID-355): 같은 원천(+운송유형)의 성공한 전송(`previousId`)이 있으면 운영자가 재전송을 고른
 * 경우(`resend`)에만 다시 보내고, plan에 그 실행 id를 남긴다. 닫힌(실패) 전송은 성공이 아니라 막지 않는다.
 */
export function sellpiaTransferResendOf(previousId: string | null, resend: boolean | undefined): string | null {
  if (previousId === null) return null;
  if (resend !== true) throw new KiditemConflictError('ORDERS_TRANSFER_ALREADY_SENT', { details: { previousOperationId: previousId } });
  return previousId;
}

/** 다시 만든 파일의 번호가 plan의 대상과 같은가(순서 무관). 다르면 원천이 바뀐 것이다. */
export function sameOrderNumbers(left: readonly string[], right: readonly string[]): boolean {
  const a = new Set(left);
  const b = new Set(right);
  return a.size === b.size && [...a].every((value) => b.has(value));
}
