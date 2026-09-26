import { Inject, Injectable } from '@nestjs/common';
import { KiditemInvalidValueError } from '@kiditem/shared/errors';
import { ORG_LOCK_KEY, type OperationPlanResult, type OperationStagedChunk, type OperationWindow } from '@kiditem/shared/operation';
import {
  COUPANG_SHIPMENT_SUMMARY_DEFAULT_MAX_PAGES,
  COUPANG_SHIPMENT_SUMMARY_KIND,
  CoupangShipmentSummaryResultSchema,
  CoupangShipmentSummaryScopeSchema,
  type CoupangShipmentSummaryResult,
} from '@kiditem/shared/orders-operations';
import { z } from 'zod';
import type {
  JsonObject,
  OperationFinalizeContext,
  OperationOwnerPort,
} from '../../../../common/operation/application/port/out/owner/operation-owner.port';
import { OperationOwner } from '../../../../common/operation/application/port/out/owner/operation-owner.decorator';
import { COUPANG_SHIPMENTS_PORT, type CoupangShipmentsPort } from '../../../application/port/in/shipments/index';
import { completeShipmentSummary, readShipmentSummaryChunks } from '../../../domain/shipments/shipment-summary-operation';

const ShipmentSummaryPlanSchema = z.object({ maxPages: z.number().int().min(1).max(60) }).strict();

/**
 * 쿠팡 쉽먼트 발송일 조회(ADR-0025 kind `orders.coupang_shipment_summary`, KID-359). 확장이 supplier 화면의 택배
 * 목록을 plan의 쪽 상한까지 읽어 발송일별 `shipment_dates` 항목과 읽은 쪽 증거 `shipment_scan` 하나를 올린다.
 * finish 트랜잭션에서 옛 attempt 제출 검증을 그대로 거쳐 그 실행의 발송일 행을 쓴다. 잠금은 조직(`org`) — 옛 attempt도
 * 조직마다 하나였다. `onFailed` 없음(실패는 원장에 적지 않는다; 옛 `inventory:` 실패 알림은 없앴다).
 */
@OperationOwner()
@Injectable()
export class CoupangShipmentSummaryOperationOwner implements OperationOwnerPort {
  readonly kind = COUPANG_SHIPMENT_SUMMARY_KIND;

  constructor(@Inject(COUPANG_SHIPMENTS_PORT) private readonly shipments: CoupangShipmentsPort) {}

  async plan(scope: JsonObject): Promise<OperationPlanResult> {
    const parsed = CoupangShipmentSummaryScopeSchema.safeParse(scope);
    if (!parsed.success) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', {
        details: {
          reason: 'invalid_scope',
          errors: parsed.error.issues.map((issue) => ({ field: issue.path.join('.'), reason: issue.message })),
        },
      });
    }
    return {
      lockKeys: [ORG_LOCK_KEY],
      plan: { maxPages: parsed.data.maxPages ?? COUPANG_SHIPMENT_SUMMARY_DEFAULT_MAX_PAGES },
    };
  }

  async finalize(
    chunks: OperationStagedChunk[],
    _window: OperationWindow | null,
    context: OperationFinalizeContext,
  ): Promise<{ result: CoupangShipmentSummaryResult }> {
    const plan = ShipmentSummaryPlanSchema.parse(context.plan);
    const { dates, scan } = readShipmentSummaryChunks(chunks);
    const items = completeShipmentSummary({ maxPages: plan.maxPages, dates, scan });
    await this.shipments.publishSummaryOperation(context.tx, {
      organizationId: context.organizationId,
      operationId: context.operationId,
      items,
    });
    return { result: CoupangShipmentSummaryResultSchema.parse({ dates: items.length, rows: scan.totalRows }) };
  }
}
