import { describe, expect, it, vi } from 'vitest';
import { canonicalOwnerInputHash } from '../../../../../common/owner-idempotency-key';
import { SupplyAgentCapabilityAdapter } from '../supply-agent-capability.adapter';

const ORG_ID = '0187e942-9098-7382-9a22-c5b821f2f5d1';
const USER_ID = '0187e942-9098-7382-9a22-c5b821f2f5d2';
const SKU_ID = '0187e942-9098-7382-9a22-c5b821f2f5d3';
const PURCHASE_ORDER_ID = '0187e942-9098-7382-9a22-c5b821f2f5d4';
const INVENTORY_ATTEMPT_ID = '0187e942-9098-7382-9a22-c5b821f2f5d5';

describe('SupplyAgentCapabilityAdapter', () => {
  it('creates a purchase-order draft through the Supply owner port', async () => {
    const drafts = { createFromRecommendation: vi.fn().mockResolvedValue({ orderId: PURCHASE_ORDER_ID, status: 'draft', href: null }) };
    const adapter = new SupplyAgentCapabilityAdapter(drafts as never, { submit: vi.fn() } as never);
    await expect(adapter.createPurchaseOrderDraft({
      organizationId: ORG_ID, idempotencyKey: 'request:supply.create_purchase_order_draft',
      inputHash: canonicalOwnerInputHash({
        masterProductId: SKU_ID,
        productName: 'Test product',
        supplierName: 'Test supplier',
        unitPriceCny: 10,
        moq: 1,
      }),
      masterProductId: SKU_ID, productName: 'Test product', supplierName: 'Test supplier', unitPriceCny: 10, moq: 1,
    })).resolves.toEqual({ orderId: PURCHASE_ORDER_ID, status: 'draft' });
    expect(drafts.createFromRecommendation).toHaveBeenCalledWith(expect.objectContaining({ organizationId: ORG_ID, idempotencyKey: 'request:supply.create_purchase_order_draft', requestHash: canonicalOwnerInputHash({ masterProductId: SKU_ID, productName: 'Test product', supplierName: 'Test supplier', unitPriceCny: 10, moq: 1 }) }));
  });

  it('requires a current actor to submit a purchase order', async () => {
    const submissions = { submit: vi.fn().mockResolvedValue({ orderId: PURCHASE_ORDER_ID, status: 'ordered' }) };
    const adapter = new SupplyAgentCapabilityAdapter({ createFromRecommendation: vi.fn() } as never, submissions as never);
    const inputHash = canonicalOwnerInputHash({
      purchaseOrderId: PURCHASE_ORDER_ID,
      inventoryAttemptId: INVENTORY_ATTEMPT_ID,
    });
    const inputWithoutActor = {
      organizationId: ORG_ID,
      idempotencyKey: 'request:supply.submit_purchase_order',
      inputHash,
      purchaseOrderId: PURCHASE_ORDER_ID,
      inventoryAttemptId: INVENTORY_ATTEMPT_ID,
    };
    await expect(adapter.submitPurchaseOrder(inputWithoutActor as never)).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    await adapter.submitPurchaseOrder({ ...inputWithoutActor, userId: USER_ID });
    expect(submissions.submit).toHaveBeenCalledWith(expect.objectContaining({ organizationId: ORG_ID, userId: USER_ID, requestHash: inputHash }));
  });
});
