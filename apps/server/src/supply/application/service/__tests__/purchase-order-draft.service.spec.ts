import { describe, expect, it } from 'vitest';
import { ProcurementService } from '../procurement.service';
import { PurchaseOrderDraftService } from '../purchase-order-draft.service';

describe('PurchaseOrderDraftService', () => {
  it('creates a draft purchase order from sourcing recommendation summary', async () => {
    const procurement = {
      create: async (organizationId: string, command: any) => ({
        id: 'purchase-order-1',
        organizationId,
        status: 'draft',
        supplierName: command.supplierName,
        items: command.items,
      }),
    } as unknown as ProcurementService;

    const service = new PurchaseOrderDraftService(procurement);
    const result = await service.createFromRecommendation({
      organizationId: 'org-1',
      recommendation: {
        productName: '실리콘 식판 흡착형 신제품',
        supplierName: '1688 Kids Tableware Factory',
        unitPriceCny: 22.8,
        moq: 2,
        testQuantity: 6,
      },
    });

    expect(result.orderId).toBe('purchase-order-1');
    expect(result.status).toBe('draft');
  });
});
