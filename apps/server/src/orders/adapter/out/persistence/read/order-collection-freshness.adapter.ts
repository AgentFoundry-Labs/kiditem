import { Inject, Injectable } from '@nestjs/common';
import {
  COUPANG_DIRECTSHIP_KIND,
  COUPANG_ROCKET_PO_KIND,
  COUPANG_SHIPMENT_SUMMARY_KIND,
  MALL_ORDERS_KIND,
  SELLPIA_SHIPMENT_TRACKING_KIND,
} from '@kiditem/shared/orders-operations';
import {
  OPERATION_PORT,
  type OperationPort,
} from '../../../../../common/operation/application/port/in/operation.port';
import type { OrderCollectionFreshnessPort } from '../../../../application/port/in/order-collection-freshness.port';

/** 실행 kind → 대시보드가 읽는 옛 원천 이름. */
const SOURCE_TYPE_BY_KIND: ReadonlyArray<readonly [string, string]> = [
  [MALL_ORDERS_KIND, 'order_collection_mall'],
  [SELLPIA_SHIPMENT_TRACKING_KIND, 'sellpia_shipment_tracking'],
  [COUPANG_DIRECTSHIP_KIND, 'coupang_direct_order_capture'],
  [COUPANG_SHIPMENT_SUMMARY_KIND, 'coupang_shipment_summary'],
  [COUPANG_ROCKET_PO_KIND, 'coupang_rocket_po_catalog'],
];

/** kind마다 가장 최근에 시작한 성공 실행 하나의 끝난 시각. 실행 표는 실행 계약의 reader로만 읽는다(ADR-0025). */
@Injectable()
export class OrderCollectionFreshnessAdapter implements OrderCollectionFreshnessPort {
  constructor(@Inject(OPERATION_PORT) private readonly operations: OperationPort) {}

  async readLastSucceeded(organizationId: string): Promise<ReadonlyMap<string, Date>> {
    const latest = new Map<string, Date>();
    for (const [kind, sourceType] of SOURCE_TYPE_BY_KIND) {
      const { operations } = await this.operations.list(organizationId, { kinds: [kind], status: 'succeeded', limit: 1 });
      const finishedAt = operations[0]?.finishedAt;
      if (finishedAt) latest.set(sourceType, new Date(finishedAt));
    }
    return latest;
  }
}
