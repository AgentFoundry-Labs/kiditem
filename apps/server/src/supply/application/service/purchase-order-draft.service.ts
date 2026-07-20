import { Injectable } from '@nestjs/common';
import type {
  CreatePurchaseOrderDraftFromRecommendationInput,
  PurchaseOrderDraftPort,
  PurchaseOrderDraftResult,
} from '../port/in/procurement/purchase-order-draft.port';
import { ProcurementService } from './procurement.service';

function orderIdFromUnknown(order: unknown): string {
  if (
    order &&
    typeof order === 'object' &&
    'id' in order &&
    typeof order.id === 'string'
  ) {
    return order.id;
  }
  throw new Error('Purchase order draft result did not include id.');
}

function statusFromUnknown(order: unknown): string {
  if (
    order &&
    typeof order === 'object' &&
    'status' in order &&
    typeof order.status === 'string'
  ) {
    return order.status;
  }
  return 'draft';
}

@Injectable()
export class PurchaseOrderDraftService implements PurchaseOrderDraftPort {
  constructor(private readonly procurement: ProcurementService) {}

  async createFromRecommendation(
    input: CreatePurchaseOrderDraftFromRecommendationInput,
  ): Promise<PurchaseOrderDraftResult> {
    const quantity = Math.max(
      input.recommendation.moq,
      input.recommendation.testQuantity ?? input.recommendation.moq,
    );
    const order = await this.procurement.create(input.organizationId, {
      supplierName: input.recommendation.supplierName,
      supplierId: input.recommendation.supplierId ?? undefined,
      items: [
        {
          sellpiaInventorySkuId: input.recommendation.sellpiaInventorySkuId,
          productName: input.recommendation.productName,
          quantity,
          unitPriceCny: input.recommendation.unitPriceCny,
        },
      ],
    });
    const orderId = orderIdFromUnknown(order);
    return {
      orderId,
      status: statusFromUnknown(order),
      href: `/purchase-orders?orderId=${orderId}`,
    };
  }
}
