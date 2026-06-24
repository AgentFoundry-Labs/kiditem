import { describe, expect, it, vi } from 'vitest';
import { SupplyAgentCapabilityAdapter } from '../supply-agent-capability.adapter';
import type { AgentCapabilityRegistry } from '../../../../agent-os/application/service/agent-capability-registry.service';
import type { PurchaseOrderDraftPort } from '../../../../application/port/in/procurement/purchase-order-draft.port';
import type { PurchaseOrderSubmissionPort } from '../../../../application/port/in/procurement/purchase-order-submission.port';

const PURCHASE_ORDER_ID = '0187e942-9098-7382-9a22-c5b821f2f5d1';

describe('SupplyAgentCapabilityAdapter', () => {
  it('scopes purchase order draft idempotency to the selected recommendation artifact', () => {
    const register = vi.fn();
    const registry = { register } as unknown as AgentCapabilityRegistry;
    const drafts = {
      createFromRecommendation: vi.fn(),
    } as unknown as PurchaseOrderDraftPort;
    const submissions = {
      submit: vi.fn(),
    } as unknown as PurchaseOrderSubmissionPort;
    const adapter = new SupplyAgentCapabilityAdapter(
      registry,
      drafts,
      submissions,
    );

    adapter.onModuleInit();

    const draftHandler = register.mock.calls
      .map((call) => call[0])
      .find((handler) => handler.key === 'supply.create_purchase_order_draft');

    expect(
      draftHandler.idempotencyKey({
        organizationId: 'org-1',
        conversationId: 'conversation-1',
        agentInstanceId: 'agent-order-1',
        agentType: 'order',
        requestId: 'request-1',
        runId: 'run-1',
        input: {
          recommendationArtifactId: '0187e942-9098-7382-9a22-c5b821f2f5d1',
          productName: '실리콘 식판 흡착형 신제품',
          supplierName: '1688 Kids Tableware Factory',
          unitPriceCny: 22.8,
          moq: 2,
          testQuantity: 6,
        },
      }),
    ).toBe(
      'org-1:supply.create_purchase_order_draft:recommendation_artifact:0187e942-9098-7382-9a22-c5b821f2f5d1',
    );
    expect(
      draftHandler.idempotencyKey({
        organizationId: 'org-1',
        conversationId: 'conversation-1',
        agentInstanceId: 'agent-order-1',
        agentType: 'order',
        requestId: 'request-2',
        runId: 'run-2',
        input: {
          productName: '실리콘 식판 흡착형 신제품',
          supplierName: '1688 Kids Tableware Factory',
          unitPriceCny: 22.8,
          moq: 2,
          testQuantity: 6,
        },
      }),
    ).toBe('org-1:supply.create_purchase_order_draft:request:request-2');
  });

  it('requires an explicit supplier name for purchase order draft recommendations', () => {
    const register = vi.fn();
    const registry = { register } as unknown as AgentCapabilityRegistry;
    const drafts = {
      createFromRecommendation: vi.fn(),
    } as unknown as PurchaseOrderDraftPort;
    const submissions = {
      submit: vi.fn(),
    } as unknown as PurchaseOrderSubmissionPort;
    const adapter = new SupplyAgentCapabilityAdapter(
      registry,
      drafts,
      submissions,
    );

    adapter.onModuleInit();

    const draftHandler = register.mock.calls
      .map((call) => call[0])
      .find((handler) => handler.key === 'supply.create_purchase_order_draft');

    expect(
      draftHandler.inputSchema.safeParse({
        productName: '실리콘 식판 흡착형 신제품',
        unitPriceCny: 22.8,
        moq: 2,
      }).success,
    ).toBe(false);
  });

  it('creates purchase order drafts from explicit recommendation terms only', async () => {
    const register = vi.fn();
    const registry = { register } as unknown as AgentCapabilityRegistry;
    const drafts = {
      createFromRecommendation: vi.fn().mockResolvedValue({
        orderId: PURCHASE_ORDER_ID,
        status: 'draft',
        href: `/purchase-orders?orderId=${PURCHASE_ORDER_ID}`,
      }),
    } as unknown as PurchaseOrderDraftPort;
    const submissions = {
      submit: vi.fn(),
    } as unknown as PurchaseOrderSubmissionPort;
    const adapter = new SupplyAgentCapabilityAdapter(
      registry,
      drafts,
      submissions,
    );

    adapter.onModuleInit();

    const draftHandler = register.mock.calls
      .map((call) => call[0])
      .find((handler) => handler.key === 'supply.create_purchase_order_draft');

    await draftHandler.execute({
      organizationId: 'org-1',
      conversationId: 'conversation-1',
      agentInstanceId: 'agent-order-1',
      agentType: 'order',
      requestId: 'request-1',
      runId: 'run-1',
      input: {
        recommendationArtifactId: '0187e942-9098-7382-9a22-c5b821f2f5d1',
        productName: '실리콘 식판 흡착형 신제품',
        supplierName: '1688 Kids Tableware Factory',
        unitPriceCny: 22.8,
        moq: 2,
      },
    });

    expect(drafts.createFromRecommendation).toHaveBeenCalledWith({
      organizationId: 'org-1',
      recommendation: {
        productName: '실리콘 식판 흡착형 신제품',
        supplierName: '1688 Kids Tableware Factory',
        supplierId: null,
        unitPriceCny: 22.8,
        moq: 2,
        testQuantity: null,
      },
    });
  });

  it('registers purchase order draft and approval-gated submission capabilities', async () => {
    const register = vi.fn();
    const registry = { register } as unknown as AgentCapabilityRegistry;
    const drafts = {
      createFromRecommendation: vi.fn(),
    } as unknown as PurchaseOrderDraftPort;
    const submissions = {
      submit: vi.fn().mockResolvedValue({
        orderId: PURCHASE_ORDER_ID,
        status: 'ordered',
        externalOrderId: '1688-ORDER-1',
        externalOrderUrl: 'https://trade.1688.com/order/1688-ORDER-1.html',
        href: `/purchase-orders?orderId=${PURCHASE_ORDER_ID}`,
      }),
    } as unknown as PurchaseOrderSubmissionPort;
    const adapter = new SupplyAgentCapabilityAdapter(
      registry,
      drafts,
      submissions,
    );

    adapter.onModuleInit();

    expect(register).toHaveBeenCalledTimes(2);
    const submitHandler = register.mock.calls
      .map((call) => call[0])
      .find((handler) => handler.key === 'supply.submit_purchase_order');
    expect(submitHandler).toMatchObject({
      key: 'supply.submit_purchase_order',
      ownerDomain: 'supply',
      executionKind: 'workflow',
      sideEffects: ['external_write', 'db_write'],
      approvalRisk: 'high',
    });
    expect(
      submitHandler.idempotencyKey({
        organizationId: 'org-1',
        conversationId: 'conversation-1',
        agentInstanceId: 'agent-order-1',
        agentType: 'order',
        requestId: 'request-1',
        runId: 'run-1',
        input: { purchaseOrderId: PURCHASE_ORDER_ID },
      }),
    ).toBe(`org-1:supply.submit_purchase_order:${PURCHASE_ORDER_ID}`);

    const result = await submitHandler.execute({
      organizationId: 'org-1',
      conversationId: 'conversation-1',
      agentInstanceId: 'agent-order-1',
      agentType: 'order',
      requestId: 'request-1',
      runId: 'run-1',
      requestedByUserId: 'user-1',
      input: {
        purchaseOrderId: PURCHASE_ORDER_ID,
        externalOrderPlatform: ' ALIBABA_1688 ',
        externalOrderId: ' 1688-ORDER-1 ',
        externalOrderUrl: ' https://trade.1688.com/order/1688-ORDER-1.html ',
      },
    });

    expect(submissions.submit).toHaveBeenCalledWith({
      organizationId: 'org-1',
      purchaseOrderId: PURCHASE_ORDER_ID,
      externalOrderPlatform: 'ALIBABA_1688',
      externalOrderId: '1688-ORDER-1',
      externalOrderUrl: 'https://trade.1688.com/order/1688-ORDER-1.html',
    });
    expect(result).toEqual({
      resourceType: 'purchase_order',
      resourceId: PURCHASE_ORDER_ID,
      outputSummary: {
        orderId: PURCHASE_ORDER_ID,
        status: 'ordered',
        externalOrderPlatform: 'ALIBABA_1688',
        externalOrderId: '1688-ORDER-1',
        externalOrderUrl: 'https://trade.1688.com/order/1688-ORDER-1.html',
      },
      artifacts: [
        {
          artifactType: 'purchase_order_submission',
          targetDomain: 'supply',
          targetModel: 'PurchaseOrder',
          targetId: PURCHASE_ORDER_ID,
          title: '발주 제출 완료',
          href: `/purchase-orders?orderId=${PURCHASE_ORDER_ID}`,
          summary: {
            status: 'ordered',
            orderId: PURCHASE_ORDER_ID,
            externalOrderPlatform: 'ALIBABA_1688',
            externalOrderId: '1688-ORDER-1',
            externalOrderUrl: 'https://trade.1688.com/order/1688-ORDER-1.html',
          },
        },
      ],
    });
  });
});
