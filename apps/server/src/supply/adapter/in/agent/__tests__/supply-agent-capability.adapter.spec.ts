import { describe, expect, it, vi } from 'vitest';
import type { AgentCapabilityRegistry } from '../../../../../agent-os/application/service/agent-capability-registry.service';
import { officialCapabilityExecution } from '../../../../../agent-os/test-helpers/official-capability-execution';
import { SupplyAgentCapabilityAdapter } from '../supply-agent-capability.adapter';

const RECOMMENDATION_ID = '0187e942-9098-7382-9a22-c5b821f2f5d1';
const PURCHASE_ORDER_ID = '0187e942-9098-7382-9a22-c5b821f2f5d2';

describe('SupplyAgentCapabilityAdapter', () => {
  it.each([
    ['supply.create_purchase_order_draft', {
      recommendationArtifactId: RECOMMENDATION_ID,
      sellpiaInventorySkuId: RECOMMENDATION_ID,
      productName: 'Test product', supplierName: 'Test supplier', unitPriceCny: 10, moq: 1,
    }],
    ['supply.submit_purchase_order', { purchaseOrderId: PURCHASE_ORDER_ID }],
  ])('registers %s against exact official context', async (key, input) => {
    const register = vi.fn();
    const drafts = {
      createFromRecommendation: vi.fn().mockResolvedValue({ orderId: PURCHASE_ORDER_ID, status: 'draft', href: null }),
    };
    const submissions = {
      submit: vi.fn().mockResolvedValue({ orderId: PURCHASE_ORDER_ID, status: 'submitted', href: null, externalOrderPlatform: null, externalOrderId: null, externalOrderUrl: null }),
    };
    const adapter = new SupplyAgentCapabilityAdapter(
      { register } as unknown as AgentCapabilityRegistry,
      drafts as never,
      submissions as never,
    );
    adapter.onModuleInit();
    const handler = register.mock.calls.map(([candidate]) => candidate)
      .find((candidate) => candidate.key === key)!;

    const execution = officialCapabilityExecution(input);
    expect(handler.idempotencyKey(execution as never)).toContain(
      '00000000-0000-4000-8000-000000000001',
    );
    await handler.execute(execution as never);

    if (key === 'supply.create_purchase_order_draft') {
      expect(drafts.createFromRecommendation).toHaveBeenCalledWith(expect.objectContaining({
        organizationId: 'org-1',
      }));
      expect(submissions.submit).not.toHaveBeenCalled();
    } else {
      expect(submissions.submit).toHaveBeenCalledWith(expect.objectContaining({
        organizationId: 'org-1',
        userId: 'user-1',
      }));
      expect(drafts.createFromRecommendation).not.toHaveBeenCalled();
    }
  });

  it('rejects submission without an official actor', async () => {
    const register = vi.fn();
    const submissions = { submit: vi.fn() };
    const adapter = new SupplyAgentCapabilityAdapter(
      { register } as unknown as AgentCapabilityRegistry,
      { createFromRecommendation: vi.fn() } as never,
      submissions as never,
    );
    adapter.onModuleInit();
    const handler = register.mock.calls.map(([candidate]) => candidate)
      .find((candidate) => candidate.key === 'supply.submit_purchase_order')!;

    await expect(handler.execute(officialCapabilityExecution(
      { purchaseOrderId: PURCHASE_ORDER_ID },
      { actor: null },
    ) as never)).rejects.toThrow('authenticated actor');
    expect(submissions.submit).not.toHaveBeenCalled();
  });
});
