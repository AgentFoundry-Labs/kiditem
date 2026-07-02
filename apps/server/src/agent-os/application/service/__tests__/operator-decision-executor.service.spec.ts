import { describe, expect, it, vi } from 'vitest';
import { AgentOsRuntimeError } from '../../../domain/agent-os.errors';
import type { AgentOsRepositoryPort } from '../../port/out/repository/agent-os-repository.port';
import type { AgentOsLiveReadinessPort } from '../../port/out/cross-domain/agent-os-live-readiness.port';
import { AgentTaskDelegationService } from '../agent-task-delegation.service';
import { OperatorDecisionExecutor } from '../operator-decision-executor.service';

function makeExecutor(options?: { liveReadiness?: AgentOsLiveReadinessPort }) {
  const delegation = {
    delegate: vi.fn().mockResolvedValue({
      ok: true,
      requestId: 'request-sourcing-1',
      agentType: 'sourcing',
      status: 'pending',
    }),
  } as unknown as AgentTaskDelegationService;
  const repository = {
    createMessage: vi.fn().mockResolvedValue({
      id: 'message-operator-1',
      organizationId: 'org-1',
      conversationId: 'conversation-1',
      role: 'assistant',
      content: 'message',
      requestId: 'request-operator-1',
      runId: 'run-operator-1',
      metadata: {},
      createdAt: new Date('2026-05-30T00:00:00.000Z'),
    }),
    appendRunEvent: vi.fn().mockResolvedValue({}),
  } as unknown as AgentOsRepositoryPort;

  return {
    delegation,
    repository,
    executor: new OperatorDecisionExecutor(
      delegation,
      repository,
      undefined,
      options?.liveReadiness,
    ),
  };
}

const baseInput = {
  organizationId: 'org-1',
  conversationId: 'conversation-1',
  parentRequestId: 'request-operator-1',
  delegatedByRunId: 'run-operator-1',
  operatorAgentInstanceId: 'agent-operator-1',
  requestedByUserId: 'user-1',
};

describe('OperatorDecisionExecutor', () => {
  it('delegates a valid sourcing decision with a stable idempotency key', async () => {
    const { executor, delegation, repository } = makeExecutor();

    const result = await executor.execute({
      ...baseInput,
      decision: {
        decisionType: 'delegate',
        targetAgentType: 'sourcing',
        playbookKey: 'sourcing_market_opportunity_to_order_draft_v1',
        taskInput: { keyword: '실리콘 식판' },
        userVisibleRationale: '소싱 에이전트가 시장 신호를 확인해야 합니다.',
      },
    });

    expect(result).toEqual({
      status: 'delegated',
      delegatedRequestId: 'request-sourcing-1',
      targetAgentType: 'sourcing',
      planStepKey: 'sourcing_agent',
    });
    expect(delegation.delegate).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        agentType: 'sourcing',
        conversationId: 'conversation-1',
        parentRequestId: 'request-operator-1',
        delegatedByRunId: 'run-operator-1',
        requestedByUserId: 'user-1',
        playbookKey: 'sourcing_market_opportunity_to_order_draft_v1',
        planStepKey: 'sourcing_agent',
        displayName: 'Sourcing Agent',
        idempotencyKey: expect.stringMatching(
          /^operator:request-operator-1:sourcing:sourcing_agent:/,
        ),
        payload: expect.objectContaining({
          action: 'market_opportunity_discovery',
          keyword: '실리콘 식판',
          conversationId: 'conversation-1',
          operatorRationale: '소싱 에이전트가 시장 신호를 확인해야 합니다.',
        }),
      }),
    );
    expect(repository.appendRunEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'operator.delegated_task_created',
        data: expect.objectContaining({
          delegatedRequestId: 'request-sourcing-1',
        }),
      }),
    );
  });

  it('delegates manual URL intake to sourcing manual_url_intake runtime input', async () => {
    const { executor, delegation } = makeExecutor();

    const result = await executor.execute({
      ...baseInput,
      decision: {
        decisionType: 'delegate',
        targetAgentType: 'sourcing',
        playbookKey: 'manual_product_intake_from_url_v1',
        taskInput: { sourceUrl: 'https://detail.1688.com/offer/123.html' },
        userVisibleRationale: '사용자가 제공한 상품 URL을 먼저 수집해야 합니다.',
      },
    });

    expect(result).toEqual({
      status: 'delegated',
      delegatedRequestId: 'request-sourcing-1',
      targetAgentType: 'sourcing',
      planStepKey: 'sourcing_agent',
    });
    expect(delegation.delegate).toHaveBeenCalledWith(
      expect.objectContaining({
        playbookKey: 'manual_product_intake_from_url_v1',
        planStepKey: 'sourcing_agent',
        payload: expect.objectContaining({
          action: 'manual_url_intake',
          url: 'https://detail.1688.com/offer/123.html',
          sourceUrl: 'https://detail.1688.com/offer/123.html',
          conversationId: 'conversation-1',
          operatorRationale: '사용자가 제공한 상품 URL을 먼저 수집해야 합니다.',
        }),
      }),
    );
  });

  it('delegates listing prep to the Listing Agent instead of sourcing', async () => {
    const { executor, delegation } = makeExecutor();

    const result = await executor.execute({
      ...baseInput,
      decision: {
        decisionType: 'delegate',
        targetAgentType: 'listing',
        playbookKey: 'manual_product_intake_from_url_v1',
        taskInput: {
          productName: '무선 RC카',
          imageUrls: ['https://cdn.example.com/car.jpg'],
        },
        userVisibleRationale: '소싱 후보를 등록 준비 패키지로 변환해야 합니다.',
      },
    });

    expect(result).toEqual({
      status: 'delegated',
      delegatedRequestId: 'request-sourcing-1',
      targetAgentType: 'listing',
      planStepKey: 'listing_prep',
    });
    expect(delegation.delegate).toHaveBeenCalledWith(
      expect.objectContaining({
        agentType: 'listing',
        playbookKey: 'manual_product_intake_from_url_v1',
        planStepKey: 'listing_prep',
        displayName: 'Listing Agent',
        idempotencyKey: expect.stringMatching(
          /^operator:request-operator-1:listing:listing_prep:/,
        ),
        payload: expect.objectContaining({
          action: 'product_listing_generation_package',
          productName: '무선 RC카',
          imageUrls: ['https://cdn.example.com/car.jpg'],
          conversationId: 'conversation-1',
          operatorRationale: '소싱 후보를 등록 준비 패키지로 변환해야 합니다.',
        }),
      }),
    );
  });

  it('delegates confirmed channel listing registration to the channel registration runtime input', async () => {
    const { executor, delegation } = makeExecutor();

    const result = await executor.execute({
      ...baseInput,
      decision: {
        decisionType: 'delegate',
        targetAgentType: 'channel_registration',
        playbookKey: 'confirmed_channel_listing_registration_v1',
        taskInput: {
          masterId: '00000000-0000-4000-8000-000000000001',
          channelAccountId: '00000000-0000-4000-8000-000000000002',
          externalId: 'COUPANG-720445',
          productBarcode: '8806384882841',
          channelName: '쿠팡 판매명',
          channelPrice: 12900,
        },
        userVisibleRationale: '확인된 쿠팡 등록상품 ID를 KidItem 등록상품에 연결해야 합니다.',
      },
    });

    expect(result).toEqual({
      status: 'delegated',
      delegatedRequestId: 'request-sourcing-1',
      targetAgentType: 'channel_registration',
      planStepKey: 'channel_registration',
    });
    expect(delegation.delegate).toHaveBeenCalledWith(
      expect.objectContaining({
        agentType: 'channel_registration',
        playbookKey: 'confirmed_channel_listing_registration_v1',
        planStepKey: 'channel_registration',
        displayName: 'Channel Registration Agent',
        idempotencyKey: expect.stringMatching(
          /^operator:request-operator-1:channel_registration:channel_registration:/,
        ),
        payload: expect.objectContaining({
          action: 'confirmed_listing_registration',
          masterId: '00000000-0000-4000-8000-000000000001',
          channelAccountId: '00000000-0000-4000-8000-000000000002',
          externalId: 'COUPANG-720445',
          productBarcode: '8806384882841',
          channelName: '쿠팡 판매명',
          channelPrice: 12900,
          conversationId: 'conversation-1',
          operatorRationale: '확인된 쿠팡 등록상품 ID를 KidItem 등록상품에 연결해야 합니다.',
        }),
      }),
    );
  });

  it('delegates Coupang listing submission to the channel registration runtime input', async () => {
    const { executor, delegation } = makeExecutor();

    const result = await executor.execute({
      ...baseInput,
      decision: {
        decisionType: 'delegate',
        targetAgentType: 'channel_registration',
        playbookKey: 'coupang_listing_submission_v1',
        taskInput: {
          masterId: '00000000-0000-4000-8000-000000000001',
          channelAccountId: '00000000-0000-4000-8000-000000000002',
          productBarcode: '8806384882841',
          listingPayload: {
            vendorId: 'A00012345',
            sellerProductName: '쿠팡 판매명',
            requested: true,
            items: [{ itemName: '단품', salePrice: 12900 }],
          },
        },
        userVisibleRationale: '상세페이지와 썸네일이 준비되어 쿠팡 상품 생성 API에 제출합니다.',
      },
    });

    expect(result).toEqual({
      status: 'delegated',
      delegatedRequestId: 'request-sourcing-1',
      targetAgentType: 'channel_registration',
      planStepKey: 'channel_registration',
    });
    expect(delegation.delegate).toHaveBeenCalledWith(
      expect.objectContaining({
        agentType: 'channel_registration',
        playbookKey: 'coupang_listing_submission_v1',
        planStepKey: 'channel_registration',
        displayName: 'Channel Registration Agent',
        payload: expect.objectContaining({
          action: 'coupang_listing_submit',
          masterId: '00000000-0000-4000-8000-000000000001',
          channelAccountId: '00000000-0000-4000-8000-000000000002',
          productBarcode: '8806384882841',
          listingPayload: {
            vendorId: 'A00012345',
            sellerProductName: '쿠팡 판매명',
            requested: true,
            items: [{ itemName: '단품', salePrice: 12900 }],
          },
          conversationId: 'conversation-1',
          operatorRationale: '상세페이지와 썸네일이 준비되어 쿠팡 상품 생성 API에 제출합니다.',
        }),
      }),
    );
  });

  it('parses structured-output listingPayloadJson before delegating Coupang listing submission', async () => {
    const { executor, delegation } = makeExecutor();

    await executor.execute({
      ...baseInput,
      decision: {
        decisionType: 'delegate',
        targetAgentType: 'channel_registration',
        playbookKey: 'coupang_listing_submission_v1',
        taskInput: {
          masterId: '00000000-0000-4000-8000-000000000001',
          channelAccountId: '00000000-0000-4000-8000-000000000002',
          listingPayloadJson: JSON.stringify({
            vendorId: 'A00012345',
            sellerProductName: '쿠팡 판매명',
            requested: true,
          }),
        },
        userVisibleRationale: 'OpenAI strict schema에서는 payload를 JSON 문자열로 전달합니다.',
      },
    });

    expect(delegation.delegate).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          action: 'coupang_listing_submit',
          listingPayload: {
            vendorId: 'A00012345',
            sellerProductName: '쿠팡 판매명',
            requested: true,
          },
        }),
      }),
    );
    expect(
      (delegation.delegate as ReturnType<typeof vi.fn>).mock.calls[0][0].payload,
    ).not.toHaveProperty('listingPayloadJson');
  });

  it('rejects a live commerce delegation when readiness blocks its capability', async () => {
    const liveReadiness = {
      getAgentOsLiveStatus: vi.fn().mockResolvedValue({
        checks: [
          {
            key: 'coupang_seller_product_api',
            label: 'Coupang Seller Product API',
            status: 'missing',
            detail: 'Missing: Coupang Access Key.',
            requiredFor: ['channels.submit_coupang_listing'],
            remediation: 'Save Coupang API credentials.',
          },
        ],
        allReady: false,
        runnableCapabilities: ['operator_runtime'],
        blockedCapabilities: ['channels.submit_coupang_listing'],
      }),
    } satisfies AgentOsLiveReadinessPort;
    const { executor, delegation, repository } = makeExecutor({ liveReadiness });

    await expect(
      executor.execute({
        ...baseInput,
        decision: {
          decisionType: 'delegate',
          targetAgentType: 'channel_registration',
          playbookKey: 'coupang_listing_submission_v1',
          taskInput: {
            masterId: '00000000-0000-4000-8000-000000000001',
            channelAccountId: '00000000-0000-4000-8000-000000000002',
            listingPayloadJson: JSON.stringify({
              vendorId: 'A00012345',
              sellerProductName: '쿠팡 판매명',
              requested: true,
            }),
          },
          userVisibleRationale: '쿠팡 상품 생성 API에 제출합니다.',
        },
      }),
    ).rejects.toMatchObject({
      code: 'operator_decision_blocked_by_readiness',
    });

    expect(liveReadiness.getAgentOsLiveStatus).toHaveBeenCalledWith('org-1');
    expect(delegation.delegate).not.toHaveBeenCalled();
    expect(repository.appendRunEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'operator.delegation_blocked_by_readiness',
        data: expect.objectContaining({
          capabilityKey: 'channels.submit_coupang_listing',
          playbookKey: 'coupang_listing_submission_v1',
        }),
      }),
    );
  });

  it('delegates purchase order submission to the order runtime input', async () => {
    const { executor, delegation } = makeExecutor();

    const result = await executor.execute({
      ...baseInput,
      decision: {
        decisionType: 'delegate',
        targetAgentType: 'order',
        playbookKey: 'purchase_order_submission_v1',
        taskInput: {
          purchaseOrderId: '0187e942-9098-7382-9a22-c5b821f2f5d1',
          externalOrderPlatform: 'ALIBABA_1688',
          externalOrderId: '1688-ORDER-1',
          externalOrderUrl: 'https://trade.1688.com/order/1688-ORDER-1.html',
        },
        userVisibleRationale: '사용자가 발주 제출을 승인했습니다.',
      },
    });

    expect(result).toEqual({
      status: 'delegated',
      delegatedRequestId: 'request-sourcing-1',
      targetAgentType: 'order',
      planStepKey: 'order_submit',
    });
    expect(delegation.delegate).toHaveBeenCalledWith(
      expect.objectContaining({
        agentType: 'order',
        playbookKey: 'purchase_order_submission_v1',
        planStepKey: 'order_submit',
        displayName: 'Order Agent',
        payload: expect.objectContaining({
          action: 'submit_purchase_order',
          purchaseOrderId: '0187e942-9098-7382-9a22-c5b821f2f5d1',
          externalOrderPlatform: 'ALIBABA_1688',
          externalOrderId: '1688-ORDER-1',
          externalOrderUrl: 'https://trade.1688.com/order/1688-ORDER-1.html',
          conversationId: 'conversation-1',
          operatorRationale: '사용자가 발주 제출을 승인했습니다.',
        }),
      }),
    );
  });

  it('rejects manual URL intake without a source URL before delegation', async () => {
    const { executor, delegation } = makeExecutor();

    await expect(
      executor.execute({
        ...baseInput,
        decision: {
          decisionType: 'delegate',
          targetAgentType: 'sourcing',
          playbookKey: 'manual_product_intake_from_url_v1',
          taskInput: { productName: '실리콘 흡착 식판' },
          userVisibleRationale: '수집 URL이 필요합니다.',
        },
      }),
    ).rejects.toEqual(
      new AgentOsRuntimeError(
        'operator_decision_invalid_task_input',
        'manual_product_intake_from_url_v1 requires sourceUrl or url.',
      ),
    );
    expect(delegation.delegate).not.toHaveBeenCalled();
  });

  it('creates an assistant message for ask_user without a child task', async () => {
    const { executor, delegation, repository } = makeExecutor();

    const result = await executor.execute({
      ...baseInput,
      decision: {
        decisionType: 'ask_user',
        question: '어떤 카테고리에서 먼저 찾을까요?',
        reason: '검색 범위를 좁혀야 합니다.',
      },
    });

    expect(result).toEqual({
      status: 'asked_user',
      messageId: 'message-operator-1',
    });
    expect(delegation.delegate).not.toHaveBeenCalled();
    expect(repository.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'assistant',
        content: '어떤 카테고리에서 먼저 찾을까요?',
        metadata: {
          operatorDecision: {
            decisionType: 'ask_user',
            reason: '검색 범위를 좁혀야 합니다.',
          },
        },
      }),
    );
  });

  it('creates an assistant message for refuse without a child task', async () => {
    const { executor, delegation, repository } = makeExecutor();

    const result = await executor.execute({
      ...baseInput,
      decision: {
        decisionType: 'refuse',
        reason: '승인 없는 외부 주문은 실행할 수 없습니다.',
      },
    });

    expect(result).toEqual({
      status: 'refused',
      messageId: 'message-operator-1',
    });
    expect(delegation.delegate).not.toHaveBeenCalled();
    expect(repository.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'assistant',
        content: '승인 없는 외부 주문은 실행할 수 없습니다.',
        metadata: {
          operatorDecision: {
            decisionType: 'refuse',
          },
        },
      }),
    );
  });

  it('uses the same idempotency key for equivalent delegate inputs', async () => {
    const { executor, delegation } = makeExecutor();

    await executor.execute({
      ...baseInput,
      decision: {
        decisionType: 'delegate',
        targetAgentType: 'sourcing',
        playbookKey: 'sourcing_market_opportunity_to_order_draft_v1',
        taskInput: { keyword: '실리콘 식판', filters: { minMarginRate: 0.25 } },
        userVisibleRationale: '소싱 에이전트가 시장 신호를 확인해야 합니다.',
      },
    });
    await executor.execute({
      ...baseInput,
      decision: {
        decisionType: 'delegate',
        targetAgentType: 'sourcing',
        playbookKey: 'sourcing_market_opportunity_to_order_draft_v1',
        taskInput: { filters: { minMarginRate: 0.25 }, keyword: '실리콘 식판' },
        userVisibleRationale: '소싱 에이전트가 시장 신호를 확인해야 합니다.',
      },
    });

    const firstCall = vi.mocked(delegation.delegate).mock.calls[0]?.[0];
    const secondCall = vi.mocked(delegation.delegate).mock.calls[1]?.[0];
    expect(firstCall?.idempotencyKey).toBe(secondCall?.idempotencyKey);
  });

  it('rejects unknown playbooks before delegation', async () => {
    const { executor, delegation } = makeExecutor();

    await expect(
      executor.execute({
        ...baseInput,
        decision: {
          decisionType: 'delegate',
          targetAgentType: 'sourcing',
          playbookKey: 'unknown_playbook',
          taskInput: { keyword: '실리콘 식판' },
          userVisibleRationale: '소싱 에이전트에게 넘깁니다.',
        },
      }),
    ).rejects.toThrowError(
      new AgentOsRuntimeError(
        'operator_decision_unknown_playbook',
        'Operator selected an unknown playbook: unknown_playbook',
      ),
    );
    expect(delegation.delegate).not.toHaveBeenCalled();
  });
});
